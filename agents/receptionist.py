"""
AI RECEPTIONIST SERVICE
Fonoster (SIP) → LiveKit room → Whisper STT → Claude brain → Kokoro TTS

Replaces: Bland AI / Vapi / Retell at ~$0.01-0.02/min vs $0.25-0.33/min
Cost: SIP trunk charges only

Requirements:
  pip install livekit-agents livekit-agents[openai] livekit-agents[silero]
  pip install anthropic fastapi uvicorn pydantic PyYAML

Usage:
  python receptionist.py --config config/my-business.yaml
"""

import asyncio
import os
import yaml
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, llm
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import openai, silero
import anthropic

logger = logging.getLogger("receptionist")

# ─────────────────────────────────────────────────────────
# Business configuration (one YAML file per business)
# ─────────────────────────────────────────────────────────
@dataclass
class BusinessConfig:
    name: str
    greeting: str
    hours: str
    services: list[str]
    faqs: dict[str, str]
    booking_url: str
    transfer_number: str
    voicemail_email: str
    personality: str = "professional, warm, helpful"
    language: str = "en"
    voice: str = "alloy"  # OpenAI TTS voice

def load_config(path: str) -> BusinessConfig:
    with open(path) as f:
        data = yaml.safe_load(f)
    return BusinessConfig(**data)

# Example config file content:
EXAMPLE_CONFIG = """
name: "Acme Dental Practice"
greeting: "Thank you for calling Acme Dental! This is Sarah, how can I help you today?"
hours: "Monday-Friday 9am-5pm, Saturday 9am-1pm, closed Sunday"
services:
  - teeth cleaning and checkups
  - fillings and crowns
  - teeth whitening
  - emergency dental care
faqs:
  insurance: "We accept Delta Dental, MetLife, and Cigna. Call us to verify your coverage."
  location: "We're at 123 Main Street, Suite 200."
  parking: "Free parking is available in the garage behind our building."
  new_patient: "New patients should arrive 15 minutes early to complete paperwork."
booking_url: "https://acmedental.com/book"
transfer_number: "+15555555555"
voicemail_email: "admin@acmedental.com"
personality: "warm, professional, reassuring"
voice: "nova"
"""

# ─────────────────────────────────────────────────────────
# Claude brain — the AI reasoning layer
# ─────────────────────────────────────────────────────────
class ClaudeBrain(llm.LLM):
    """Drop-in LLM replacement using Claude for the LiveKit voice pipeline"""

    def __init__(self, config: BusinessConfig):
        self.client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self.config = config
        self.system_prompt = self._build_system_prompt()

    def _build_system_prompt(self) -> str:
        faqs_text = "\n".join(f"- {q}: {a}" for q, a in self.config.faqs.items())
        services_text = "\n".join(f"- {s}" for s in self.config.services)
        return f"""You are a receptionist for {self.config.name}.
Personality: {self.config.personality}
Hours: {self.config.hours}

Services offered:
{services_text}

Common questions and answers:
{faqs_text}

Booking URL: {self.config.booking_url}

INSTRUCTIONS:
- Keep responses SHORT (1-2 sentences max) — this is a phone call, not a text message
- Be conversational and natural, not robotic
- If someone wants to book: provide the booking URL and offer to text it to them
- If someone needs urgent help outside hours: give the emergency number if applicable
- If you can't help with something: offer to transfer to a human or take a message
- Never make up information — if you don't know, say so and offer to find out
- Always confirm caller's name early in the conversation
- When ending: always confirm any next steps

For transfers: say "One moment, let me connect you with [person/department]"
For messages: say "I'll make sure [person] gets that message right away"
"""

    async def chat(self, chat_ctx: llm.ChatContext, **kwargs):
        """Stream response from Claude"""
        messages = []
        for msg in chat_ctx.messages:
            if msg.role == "user":
                messages.append({"role": "user", "content": str(msg.content)})
            elif msg.role == "assistant":
                messages.append({"role": "assistant", "content": str(msg.content)})

        with self.client.messages.stream(
            model="claude-haiku-4-5-20251001",  # Fast + cheap for real-time voice
            max_tokens=150,  # Keep responses short for phone calls
            system=self.system_prompt,
            messages=messages if messages else [{"role": "user", "content": "Hello"}],
        ) as stream:
            async def aiter():
                for text in stream.text_stream:
                    yield llm.ChatChunk(
                        choices=[llm.Choice(
                            delta=llm.ChoiceDelta(role="assistant", content=text)
                        )]
                    )
            return aiter()

# ─────────────────────────────────────────────────────────
# Call handler — the LiveKit agent entrypoint
# ─────────────────────────────────────────────────────────
async def entrypoint(ctx: JobContext):
    # Load business config from job metadata or default
    config_path = ctx.job.metadata or os.environ.get("DEFAULT_BUSINESS_CONFIG", "config/default.yaml")

    try:
        config = load_config(config_path)
    except FileNotFoundError:
        logger.warning(f"Config not found: {config_path}, using defaults")
        config = BusinessConfig(
            name="Business",
            greeting="Hello, how can I help you today?",
            hours="Monday-Friday 9am-5pm",
            services=["general inquiry"],
            faqs={},
            booking_url="",
            transfer_number="",
            voicemail_email=""
        )

    logger.info(f"Starting receptionist for: {config.name}")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    assistant = VoiceAssistant(
        vad=silero.VAD.load(),
        # STT: Whisper via local service
        stt=openai.STT(
            base_url=os.environ.get("WHISPER_URL", "http://whisper:9000/v1"),
            api_key="not-needed",
            model="whisper-1",
            language=config.language,
        ),
        # LLM: Claude
        llm=ClaudeBrain(config),
        # TTS: OpenAI voice (swap for Kokoro when available)
        tts=openai.TTS(
            voice=config.voice,
            base_url=os.environ.get("KOKORO_URL", "https://api.openai.com/v1"),
        ),
        chat_ctx=llm.ChatContext().append(
            role="system",
            text=f"Begin with this greeting: '{config.greeting}'"
        )
    )

    assistant.start(ctx.room)

    # Handle call events
    @assistant.on("user_speech_committed")
    def on_speech(msg: llm.ChatMessage):
        logger.info(f"Caller: {msg.content}")

    @assistant.on("agent_speech_committed")
    def on_response(msg: llm.ChatMessage):
        logger.info(f"Receptionist: {msg.content}")
        # Log to Twenty CRM via webhook
        if os.environ.get("CRM_WEBHOOK_URL"):
            import httpx
            httpx.post(os.environ["CRM_WEBHOOK_URL"], json={
                "event": "call_turn",
                "speaker": "agent",
                "content": str(msg.content),
                "call_sid": ctx.room.name,
            }, timeout=2)

    await asyncio.sleep(1)
    await assistant.say(config.greeting, allow_interruptions=True)


# ─────────────────────────────────────────────────────────
# n8n → trigger an outbound AI call
# POST http://receptionist:8080/call
# Body: { "to": "+1555...", "business_config": "dental", "purpose": "appointment reminder" }
# ─────────────────────────────────────────────────────────
from fastapi import FastAPI
from pydantic import BaseModel
from livekit import api as lkapi

app = FastAPI()

class CallRequest(BaseModel):
    to: str
    business_config: str = "default"
    purpose: str = "outbound call"
    script: Optional[str] = None

@app.post("/call")
async def make_outbound_call(req: CallRequest):
    """Trigger an outbound AI call via Fonoster → LiveKit"""
    lk = lkapi.LiveKitAPI(
        url=os.environ["LIVEKIT_URL"],
        api_key=os.environ["LIVEKIT_API_KEY"],
        api_secret=os.environ["LIVEKIT_API_SECRET"],
    )

    # Create a dispatch — LiveKit will spin up an agent instance
    dispatch = await lk.agent.create_dispatch(
        lkapi.CreateAgentDispatchRequest(
            agent_name="receptionist",
            room=f"call-{req.to.replace('+', '')}-{int(asyncio.get_event_loop().time())}",
            metadata=f"config/{req.business_config}.yaml",
        )
    )

    return {"status": "dispatched", "room": dispatch.room, "purpose": req.purpose}

@app.get("/health")
async def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────
# Entry points
# ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "api":
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8080)
    else:
        # Run LiveKit agent worker
        cli.run_app(
            WorkerOptions(
                entrypoint_fnc=entrypoint,
                agent_name="receptionist",
            )
        )
