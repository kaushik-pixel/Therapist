import os
import google.generativeai as genai
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import requests
from flask import Response
from base64 import b64encode
# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder="frontend", static_url_path="/")
CORS(app)  # Enable Cross-Origin Resource Sharing

# Serve index.html from the root directory
@app.route("/")
def serve_frontend():
    return send_from_directory(os.getcwd(), "index.html")

@app.route("/test")
def test():
    return "Backend is working!"

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, host="0.0.0.0", port=port)


# Configure Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

generation_config = {
    "temperature": 0,
    "top_p": 0.95,
    "top_k": 64,
    "max_output_tokens": 8192,
    "response_mime_type": "text/plain",
}

safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
]

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash-exp",
    safety_settings=safety_settings,
    generation_config=generation_config,
    system_instruction=(
        """You are Mike, a therapist chatbot whose primary goal is to comfort and motivate the user. Whenever the user shares negative feelings or bad news, respond with positivity, empathy, and encouragement. Always aim to uplift the user’s mood and reassure them. Your responses must not exceed 200 words. If the user asks about topics unrelated to providing emotional support or therapy, you should politely refuse to answer. Stay within your role as a supportive, motivational therapist at all times. """
    ),
)

chat_sessions = {}

@app.route("/chat", methods=["POST"])
def chat():
    try:
        user_id = request.json.get("user_id", "default")
        user_message = request.json.get("message")

        if not user_message:
            return jsonify({"error": "Message cannot be empty"}), 400

        if user_id not in chat_sessions:
            chat_sessions[user_id] = model.start_chat(history=[])

        chat_session = chat_sessions[user_id]
        response = chat_session.send_message(user_message)

        # Save history for context
        chat_session.history.append({"role": "user", "parts": [user_message]})
        chat_session.history.append({"role": "model", "parts": [response.text]})
        
        # Process Gemini response text
        response_text = response.text.strip()

        # Eleven Labs TTS
        eleven_labs_api_key = os.getenv("ELEVEN_LABS_API_KEY")
        eleven_labs_url = "https://api.elevenlabs.io/v1/text-to-speech/GBv7mTt0atIp3Br8iCZE"

        headers = {
            "accept": "audio/mpeg",
            "xi-api-key": eleven_labs_api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "text": response_text,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
        }

        eleven_response = requests.post(eleven_labs_url, headers=headers, json=payload, stream=True)

        if eleven_response.status_code == 200:
            audio_blob = eleven_response.content
            audio_base64 = b64encode(audio_blob).decode('utf-8')
            return jsonify({"response": response_text, "audio_blob": audio_base64})
        
        else:
            print("⚠️ ElevenLabs failed, switching to browser TTS.")
            return jsonify({"response": response_text, "use_browser_tts": True})  # Notify frontend to use browser TTS

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": "Internal Server Error"}), 500

if __name__ == "__main__":
    app.run(debug=True)
