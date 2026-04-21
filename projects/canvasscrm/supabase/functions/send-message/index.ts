// SEND-MESSAGE — Multi-channel delivery for automation sequences.
//
// Supports: email (Plunk) and SMS (TextBee or Twilio).
//
// Plunk  — plunk.dev  — free tier, 3k emails/month, transactional, MIT SDK
// TextBee — textbee.dev — self-hostable SMS gateway using Android phone as modem
//            Free if you run it yourself. Paid cloud plan $4/mo for 200 msgs.
// Twilio  — fallback for TextBee if you want a SaaS SMS option.
//
// Called by: sequence_enrollments trigger, rep-daily-brief, callback-reminder
//
// Payload:
//   { to: string, channel: "email"|"sms", subject?: string, body: string,
//     from_name?: string, reply_to?: string }

Deno.serve(async (req) => {
  const payload = await req.json();
  const { to, channel, subject, body, from_name, reply_to } = payload;

  if (!to || !channel || !body) {
    return new Response(JSON.stringify({ error: "missing fields" }), { status: 400 });
  }

  try {
    if (channel === "email") {
      const result = await sendEmail({ to, subject: subject ?? "(no subject)", body, from_name, reply_to });
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    if (channel === "sms") {
      const result = await sendSms({ to, body });
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown channel" }), { status: 400 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

// ── Email via Plunk ────────────────────────────────────────────────────────────
// Plunk sends transactional email via a simple POST.
// Docs: https://docs.plunk.dev/#transactional-emails

async function sendEmail({
  to, subject, body, from_name, reply_to,
}: {
  to: string; subject: string; body: string;
  from_name?: string; reply_to?: string;
}) {
  const PLUNK_KEY = Deno.env.get("PLUNK_SECRET_KEY");
  if (!PLUNK_KEY) throw new Error("PLUNK_SECRET_KEY not set");

  const fromName = from_name ?? Deno.env.get("PLUNK_FROM_NAME") ?? "CanvassCRM";
  const fromEmail = Deno.env.get("PLUNK_FROM_EMAIL") ?? "hello@yourdomain.com";

  const res = await fetch("https://api.useplunk.com/v1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PLUNK_KEY}`,
    },
    body: JSON.stringify({
      to,
      subject,
      body,        // HTML is supported
      name: fromName,
      from: fromEmail,
      replyTo: reply_to ?? fromEmail,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Plunk error: ${err}`);
  }

  return await res.json();
}

// ── SMS via TextBee (self-hosted) or Twilio (SaaS fallback) ───────────────────

async function sendSms({ to, body }: { to: string; body: string }) {
  const textbeeApiKey = Deno.env.get("TEXTBEE_API_KEY");
  const textbeeDeviceId = Deno.env.get("TEXTBEE_DEVICE_ID");
  const textbeeHost = Deno.env.get("TEXTBEE_HOST") ?? "https://api.textbee.dev";

  if (textbeeApiKey && textbeeDeviceId) {
    return await sendViaTExtBee({ to, body, apiKey: textbeeApiKey, deviceId: textbeeDeviceId, host: textbeeHost });
  }

  // Fallback: Twilio
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
  if (twilioSid && twilioToken && twilioFrom) {
    return await sendViaTwilio({ to, body, sid: twilioSid, token: twilioToken, from: twilioFrom });
  }

  throw new Error("No SMS provider configured. Set TEXTBEE_API_KEY or TWILIO_ACCOUNT_SID.");
}

async function sendViaTExtBee({
  to, body, apiKey, deviceId, host,
}: {
  to: string; body: string; apiKey: string; deviceId: string; host: string;
}) {
  // TextBee docs: https://textbee.dev/docs
  const res = await fetch(`${host}/api/v1/gateway/devices/${deviceId}/send-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ recipients: [to], message: body }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TextBee error: ${err}`);
  }
  return await res.json();
}

async function sendViaTwilio({
  to, body, sid, token, from,
}: {
  to: string; body: string; sid: string; token: string; from: string;
}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${sid}:${token}`),
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio error: ${err}`);
  }
  return await res.json();
}
