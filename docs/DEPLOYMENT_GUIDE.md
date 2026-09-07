# 🌐 IncidentVoice: Production Deployment & Live URL Guide
## Hackathon Submission Requirement: Publicly Accessible Web Application

The **AssemblyAI Voice Agent Hackathon** requires a working, publicly accessible web URL for judges to test your voice agent.

IncidentVoice is containerized as a single unified production image that serves the React 19 frontend and the FastAPI/WebSocket backend on port `8000`.

---

## Option 1: Deploy to Render (Recommended — 2 Minutes)

Render provides free/standard Docker hosting with automatic HTTPS/WSS support.

1. Fork or push `incident-voice` to your GitHub account:
   ```bash
   git remote add origin https://github.com/<your-username>/incident-voice.git
   git branch -M main
   git push -u origin main
   ```
2. Log into [Render.com](https://dashboard.render.com).
3. Click **New +** -> **Web Service** -> **Build and deploy from a Git repository**.
4. Select your `incident-voice` repository.
5. Render will automatically detect the root `Dockerfile` and `render.yaml`.
6. Add the following Environment Variables in the Render Dashboard:
   - `ASSEMBLYAI_API_KEY`: Your AssemblyAI API Key (Required)
   - `GEMINI_API_KEY` (Optional): For Gemini 2.0 Flash function calling
   - `PORT`: `8000`
7. Click **Create Web Service**.
8. Once deployed, Render will provide a live HTTPS URL:
   `https://incident-voice.onrender.com`
   *(Microphone permissions and WebSockets will work out of the box).*

---

## Option 2: Deploy to Fly.io (Ultra-Low Latency Edge)

Fly.io runs applications close to your users, optimizing voice WebSocket latency.

1. Install the Fly CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```
2. Authenticate:
   ```bash
   fly auth login
   ```
3. Set your AssemblyAI API Key secret:
   ```bash
   fly secrets set ASSEMBLYAI_API_KEY="your_assemblyai_api_key"
   ```
4. Deploy using the included `fly.toml`:
   ```bash
   fly deploy
   ```
5. Your live app will be live at:
   `https://incident-voice.fly.dev`

---

## Option 3: Deploy to Google Cloud Run

1. Build and push to Google Container Registry:
   ```bash
   gcloud builds submit --tag gcr.io/[PROJECT-ID]/incident-voice
   ```
2. Deploy to Cloud Run:
   ```bash
   gcloud run deploy incident-voice \
     --image gcr.io/[PROJECT-ID]/incident-voice \
     --platform managed \
     --port 8000 \
     --set-env-vars ASSEMBLYAI_API_KEY="your_api_key" \
     --allow-unauthenticated
   ```

---

## Local Production Container Test

You can test the exact production image locally before pushing:

```bash
# Build the production image
docker build -t incident-voice-prod .

# Run with your API key
docker run -p 8000:8000 -e ASSEMBLYAI_API_KEY="your_key" incident-voice-prod
```

Visit `http://localhost:8000` to verify that the frontend and backend are running together seamlessly.
