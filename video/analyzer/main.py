"""
Video Analysis Service
POST /analyze — analyze a video file or URL
POST /generate-prompt — use Claude to write a gen prompt from a reference video
GET /health
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import subprocess, os, tempfile, base64, httpx, json, shutil
from pathlib import Path
from typing import Optional
import asyncio

app = FastAPI(title="Video Analyzer", version="1.0.0")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
WHISPER_URL = os.getenv("WHISPER_URL", "http://whisper:9000")
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/videos/output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

class AnalyzeRequest(BaseModel):
    url: Optional[str] = None
    prompt: Optional[str] = "Analyze this video comprehensively"
    extract_frames_every: int = 30
    max_frames: int = 20
    detect_scenes: bool = True
    transcribe: bool = True

class GenPromptRequest(BaseModel):
    video_path: str
    style: Optional[str] = "cinematic"
    target_model: Optional[str] = "wan2.2"


def extract_frames(video_path: str, every_n_frames: int = 30, max_frames: int = 20) -> list[str]:
    """Extract frames from video using FFmpeg, return base64 list."""
    frames_dir = Path(tempfile.mkdtemp())
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"select='not(mod(n\\,{every_n_frames}))',scale=640:-1",
        "-vsync", "vfr",
        "-frames:v", str(max_frames),
        str(frames_dir / "frame_%04d.jpg"),
        "-y", "-loglevel", "error"
    ]
    subprocess.run(cmd, check=True)
    
    frames = []
    for f in sorted(frames_dir.glob("*.jpg"))[:max_frames]:
        frames.append(base64.b64encode(f.read_bytes()).decode())
    shutil.rmtree(frames_dir, ignore_errors=True)
    return frames


def get_video_metadata(video_path: str) -> dict:
    """Get video duration, fps, resolution via FFprobe."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", "-show_format", video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)
    
    video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    return {
        "duration": float(data.get("format", {}).get("duration", 0)),
        "width": video_stream.get("width"),
        "height": video_stream.get("height"),
        "fps": eval(video_stream.get("r_frame_rate", "0/1")),
        "codec": video_stream.get("codec_name"),
        "size_mb": round(int(data.get("format", {}).get("size", 0)) / 1024 / 1024, 2)
    }


def detect_scenes(video_path: str) -> list[dict]:
    """Detect scene changes using PySceneDetect."""
    try:
        cmd = [
            "python3", "-c",
            f"""
from scenedetect import detect, ContentDetector
scenes = detect('{video_path}', ContentDetector(threshold=27.0))
import json
print(json.dumps([{{'start': float(s[0].get_seconds()), 'end': float(s[1].get_seconds())}} for s in scenes]))
"""
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return json.loads(result.stdout.strip()) if result.stdout.strip() else []
    except Exception as e:
        return []


async def transcribe_audio(video_path: str) -> str:
    """Transcribe audio using self-hosted Whisper."""
    try:
        with open(video_path, "rb") as f:
            async with httpx.AsyncClient(timeout=300) as client:
                resp = await client.post(
                    f"{WHISPER_URL}/asr",
                    params={"encode": "true", "task": "transcribe", "language": "en", "output": "txt"},
                    files={"audio_file": (Path(video_path).name, f, "video/mp4")}
                )
                return resp.text.strip() if resp.status_code == 200 else ""
    except Exception:
        return ""


async def analyze_with_claude(
    frames: list[str],
    transcript: str,
    scenes: list[dict],
    metadata: dict,
    prompt: str
) -> dict:
    """Send frames + transcript to Claude for analysis."""
    
    content = []
    
    for i, frame_b64 in enumerate(frames[:12]):
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": frame_b64}
        })
        content.append({"type": "text", "text": f"[Frame {i+1}]"})
    
    context = f"""Video metadata: {json.dumps(metadata)}
Scene count: {len(scenes)}
Scene timestamps: {json.dumps(scenes[:10])}
Transcript: {transcript[:3000] if transcript else 'No audio/transcript available'}

User request: {prompt}"""
    
    content.append({"type": "text", "text": context})
    content.append({"type": "text", "text": """
Analyze this video and return a JSON object with:
{
  "title": "descriptive title",
  "summary": "2-3 sentence overview",
  "content_type": "tutorial|review|narrative|documentary|advertisement|other",
  "key_scenes": [{"timestamp": 0.0, "description": "...", "objects": [...]}],
  "topics": ["topic1", "topic2"],
  "sentiment": "positive|neutral|negative",
  "quality_score": 1-10,
  "tags": ["tag1", "tag2", "tag3"],
  "action_items": ["item1"],
  "notable_moments": [{"timestamp": 0.0, "description": "..."}],
  "surfsense_summary": "searchable plain-text summary for knowledge base indexing"
}
Return ONLY the JSON object, no markdown."""})
    
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": content}]
            }
        )
    
    text = resp.json()["content"][0]["text"]
    try:
        return json.loads(text.replace("```json", "").replace("```", "").strip())
    except Exception:
        return {"summary": text, "tags": [], "topics": [], "quality_score": 5}


@app.post("/analyze")
async def analyze_video(
    file: Optional[UploadFile] = File(None),
    request: Optional[AnalyzeRequest] = None
):
    if request is None:
        request = AnalyzeRequest()
    
    tmp_path = None
    try:
        if file:
            suffix = Path(file.filename).suffix
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tmp.write(await file.read())
            tmp.close()
            tmp_path = tmp.name
        elif request.url:
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
            tmp.close()
            tmp_path = tmp.name
            cmd = ["yt-dlp", "--output", tmp_path, "--format", "mp4", request.url]
            try:
                subprocess.run(cmd, check=True, timeout=300)
            except Exception:
                subprocess.run(
                    ["ffmpeg", "-i", request.url, "-c", "copy", tmp_path, "-y"],
                    check=True, timeout=120
                )
        else:
            raise HTTPException(status_code=400, detail="Provide file or url")
        
        metadata = get_video_metadata(tmp_path)
        
        frames = extract_frames(tmp_path, request.extract_frames_every, request.max_frames)
        
        transcript = ""
        if request.transcribe:
            transcript = await transcribe_audio(tmp_path)
        
        scenes = []
        if request.detect_scenes:
            scenes = detect_scenes(tmp_path)
        
        analysis = await analyze_with_claude(frames, transcript, scenes, metadata, request.prompt)
        
        return {
            "status": "success",
            "metadata": metadata,
            "transcript": transcript,
            "scenes": scenes,
            "analysis": analysis,
            "frame_count": len(frames)
        }
    
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/generate-prompt")
async def generate_video_prompt(request: GenPromptRequest):
    """Analyze a reference video and generate a generation prompt for Wan2.2."""
    
    frames = extract_frames(request.video_path, every_n_frames=20, max_frames=8)
    
    content = []
    for frame_b64 in frames:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": frame_b64}})
    
    content.append({"type": "text", "text": f"""
You are a video generation prompt engineer for {request.target_model}.
Analyze these frames from a reference video and write an optimal generation prompt.

Style target: {request.style}
Model: {request.target_model}

Return JSON:
{{
  "positive_prompt": "detailed cinematic prompt for T2V...",
  "negative_prompt": "blurry, watermark, low quality...",
  "recommended_settings": {{"steps": 20, "cfg_scale": 7.5, "width": 832, "height": 480, "num_frames": 81}},
  "scene_description": "what this video shows",
  "style_notes": "key visual characteristics to replicate"
}}
Return ONLY JSON."""})
    
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": content}]
            }
        )
    
    text = resp.json()["content"][0]["text"]
    try:
        return json.loads(text.replace("```json", "").replace("```", "").strip())
    except Exception:
        return {"positive_prompt": text}


@app.get("/health")
def health():
    return {"status": "ok", "whisper_url": WHISPER_URL}
