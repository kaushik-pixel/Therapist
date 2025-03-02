const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);
let avatarMeshes; // Global storage for the avatar meshes
let idleAnim, talkingAnim1, talkingAnim2;
let lastUserInputTime = Date.now();
let idleTimeout;
let currentAnimation = null;
let talking = false; // Track if the avatar is talking
let isSpeaking = false; // Prevent multiple executions

let retryCount = 0;
const MAX_RETRIES = 10;

// Babylon.js scene setup
//let blinkTarget = null; // Declare globally

const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 3, 200, new BABYLON.Vector3(1, 1, 1), scene);
    camera.attachControl(canvas, true);
    //scene.onBeforeRenderObservable.add(() => camera.alpha = Math.max(Math.PI / 4, Math.min(camera.alpha, (3 * Math.PI) / 4)));
    camera.lowerRadiusLimit = 2; // Minimum distance to the avatar
    camera.upperRadiusLimit = 3; // Maximum distance to the avatar
    camera.lowerBetaLimit = 1.3; // Prevents camera from going too low
    camera.upperBetaLimit = 1.7; // Prevents camera from going too high
    camera.wheelDeltaPercentage = 0.01; // Zoom speed
    camera.panningSensibility = 0; // Disable panning
    camera.target = new BABYLON.Vector3(0, -1, 0);

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(1, 1, 0), scene);
    
    // Load the avatar
    BABYLON.SceneLoader.ImportMesh("", "/Models/", "Therapist.glb", scene, (meshes, animationGroupsArray) => {
        avatarMeshes = meshes; // Store the loaded meshes globally
        const avatar = meshes[0];
        avatar.position = new BABYLON.Vector3(0, -1.2, 0); // Adjust avatar position
    
        // Adjust camera focus based on bounding box
        const boundingBox = avatar.getBoundingInfo().boundingBox;
        const centerY = (boundingBox.maximumWorld.y + boundingBox.minimumWorld.y) / 2;
        camera.target = new BABYLON.Vector3(0, centerY, 0);
    
        // Store animations
        animationGroups = animationGroupsArray;
        idleAnim = scene.getAnimationGroupByName("Idle");
        talkingAnim1 = scene.getAnimationGroupByName("Talking_one");
        talkingAnim2 = scene.getAnimationGroupByName("Talking_two");
    
        // Enable smooth transitions for animations
        animationGroups.forEach(anim => anim.enableBlending(0.5));

        meshes.forEach((mesh) => {
            if (mesh.morphTargetManager) {
                const mouthSmile = mesh.morphTargetManager.getTargetByName("mouthSmile");
                let blinkTarget = mesh.morphTargetManager.getTargetByName("eyesClosed"); 

                if (mouthSmile) {
                    mouthSmile.influence = 0.5;
                    //console.log("Set initial smile at 0.5");
                }   

                if (blinkTarget) {
                    blinkTarget.influence = 0;
                    console.log("✅ Blink target found:", blinkTarget.name);
        
                    // Blink every 5 seconds
                    setInterval(() => {
                        blinkTarget.influence = 1;
                        //console.log("🔴 Eyes Closed");
        
                        setTimeout(() => {
                            blinkTarget.influence = 0;
                            //console.log("🟢 Eyes Open");
                        }, 200); // Keep eyes closed for 200ms
                    }, 5000); // Blink every 5 seconds
                } else {
                    console.warn("⚠️ Blink target NOT found.");
                }

                //console.log("Blend shapes found on:", mesh.name);
                //console.log("Number of blend shapes:", mesh.morphTargetManager.numTargets);
                for (let i = 0; i < mesh.morphTargetManager.numTargets; i++) {
                    console.log(`Blend shape ${i}:`, mesh.morphTargetManager.getTarget(i).name);
                }
            }
        });
        
        // Start idle animation after setting up everything
        playAnimation(idleAnim);
    });

    // Load background assets
    loadBackgroundAssets(scene);

    // Enable UI interaction only after the meshes are loaded
    document.getElementById('sendButton').addEventListener('click', handleUserInput);

    return scene;
};
// Function to load background assets
function loadBackgroundAssets(scene) {
    const assets = [
        { name: "Scene", file: "Scene1.glb", position: new BABYLON.Vector3(0,-1.2,-1.3), scale: new BABYLON.Vector3(1,1,1), rotation: new BABYLON.Vector3(0, Math.PI*2, 0) }
    ];
    
    assets.forEach(asset => {
        BABYLON.SceneLoader.ImportMesh("", "/Models/", asset.file, scene, (meshes) => {
            meshes.forEach(mesh => {
                mesh.position = asset.position;
                mesh.scaling = asset.scale;  // Adjust scale
                mesh.rotation = asset.rotation;  // Adjust rotation
            });
        });
    });
}



const scene = createScene();
engine.runRenderLoop(() => scene.render());

let lastTalkingAnim = null; // Track last used talking animation

function playAnimation(newAnimation) {
    if (currentAnimation) {
        currentAnimation.stop(); // Stop current animation
    }

    // Enable looping only for idle animation
    const shouldLoop = (newAnimation === idleAnim);
    newAnimation.start(shouldLoop, 1.0, newAnimation.from, newAnimation.to, false);

    scene.animationPropertiesOverride = new BABYLON.AnimationPropertiesOverride();
    scene.animationPropertiesOverride.enableBlending = true;
    scene.animationPropertiesOverride.blendingSpeed = 0.1; // Smooth blending
    currentAnimation = newAnimation;

    // If talking, switch to the next animation after this one completes
    if (talking && (newAnimation === talkingAnim1 || newAnimation === talkingAnim2)) {
        lastTalkingAnim = newAnimation; // Store last animation

        newAnimation.onAnimationEndObservable.addOnce(() => {
            if (talking) { // Only switch if still talking
                let delay = getRandomDelay(); // Get a random delay
                setTimeout(() => {
                    if (talking) {
                        let nextTalkingAnim = getAlternatingTalkingAnimation(); // Alternate animations
                        playAnimation(nextTalkingAnim);
                    }
                }, delay);
            }
        });
    }
}

// Function to generate a random delay (10s to 15s)
function getRandomDelay() {
    return Math.floor(Math.random() * 5000) + 10000; // 10s to 15s delay
}


// Function to enforce alternating talking animations
function getAlternatingTalkingAnimation() {
    return lastTalkingAnim === talkingAnim1 ? talkingAnim2 : talkingAnim1;
}



async function handleUserInput() {
    const userInput = document.getElementById("userInput").value;
    if (!userInput || isSpeaking) return; 
    
    const sendButton = document.getElementById('sendButton');
    sendButton.disabled = true;

    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInput, user_id: "default" })
    })
    .then(async (response) => {
        if (!response.ok) {
            console.error("Failed to fetch the response from the server.");
            sendButton.disabled = false;
            return;
        }

        const data = await response.json();
        const chatbotResponse = data.response;
        document.getElementById("response").innerText = chatbotResponse;

        if (data.use_browser_tts) {
            speakUsingBrowserTTS(chatbotResponse, undefined, () => {
                sendButton.disabled = false; // ✅ Re-enable after speaking
            });
            return;
        }

        if (data.audio_blob) {
            const audioBlob = new Blob([Uint8Array.from(atob(data.audio_blob), (c) => c.charCodeAt(0))], { type: "audio/mpeg" });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.onended = () => {
                sendButton.disabled = false; // Re-enable when audio finishes
            };
            audio.play();
        }
    })
    .catch((err) => console.error("Error:", err));
    sendButton.disabled = false;
}




function updateMouthMovement() {
    let talkingMeshes = ["Wolf3D_Head", "Wolf3D_Teeth"]; // Apply changes to these meshes
    let mouthIntervals = []; // Store intervals for cleanup

    avatarMeshes.forEach(mesh => {
        if (talkingMeshes.includes(mesh.name) && mesh.morphTargetManager) {
            const mouthOpen = mesh.morphTargetManager.getTargetByName("mouthOpen");

            if (!mouthOpen) {
                console.error(`Blend shape 'mouthOpen' not found on ${mesh.name}`);
                return;
            }

            if (talking) {
                // Create a new interval for this mesh
                let interval = setInterval(() => {
                    if (talking) {
                        mouthOpen.influence = Math.random() * 0.8; // Animate mouth movement
                        //console.log(`Now TALKING on ${mesh.name}! Influence: ${mouthOpen.influence}`);
                    } else {
                        clearInterval(interval);
                        mouthOpen.influence = 0;
                    }
                }, 100);
                
                mouthIntervals.push(interval); // Store for cleanup
            } else {
                clearInterval(mouthIntervals[mesh.name]);
                mouthOpen.influence = 0;
            }
        }
    });
}


function speakUsingBrowserTTS(text, voiceName = "Google UK English Male", callback = null) {
    if (isSpeaking) {
        console.warn("Already speaking, ignoring duplicate call.");
        return;
    }

    isSpeaking = true;
    const synth = window.speechSynthesis;

    if (!synth) {
        console.error("❌ Web Speech API not supported");
        isSpeaking = false;
        if (callback) callback();
        return;
    }

    console.log("🔎 Retrieving available voices...");
    let voices = synth.getVoices();
    
    if (voices.length === 0) {
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.warn(`⚠️ Voices not loaded yet, retrying... (${retryCount}/${MAX_RETRIES})`);
            setTimeout(() => speakUsingBrowserTTS(text, voiceName, callback), 300);
        } else {
            console.error("❌ Max retries reached. No voices available.");
            isSpeaking = false;
        }
        return;
    }

    console.log("✅ Voices loaded:", voices.map(v => v.name));
    let selectedVoice = voices.find(v => v.name === voiceName) || voices[0];
    console.log(`🎙 Selected voice: ${selectedVoice.name}`);

    const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];

    function speakSentence(index) {
        if (index >= sentences.length) {
            isSpeaking = false;
            console.log("🛑 Speech finished.");
            if (callback) callback();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(sentences[index].trim());
        utterance.voice = selectedVoice;
        utterance.rate = 1;
        utterance.pitch = 1;

        utterance.onstart = function () {
            console.log("🔊 Speaking:", sentences[index].trim());
            talking = true;
            playAnimation(talkingAnim1);
            updateMouthMovement();
        };

        utterance.onend = function () {
            console.log("✅ Sentence finished:", sentences[index].trim());
            talking = false;
            playAnimation(idleAnim);
            updateMouthMovement();
            setTimeout(() => speakSentence(index + 1), 100);
        };

        utterance.onerror = function (event) {
            console.error("❌ SpeechSynthesis error:", event.error);
            isSpeaking = false;
        };

        synth.speak(utterance);
    }

    synth.cancel(); // Cancel any ongoing speech before starting
    console.log("🛑 Any ongoing speech canceled, starting new speech...");
    speakSentence(0);
}

// 🔊 Log available voices
window.speechSynthesis.onvoiceschanged = function() {
    const voices = window.speechSynthesis.getVoices();
    console.log("🔍 Available Voices:");
    voices.forEach((voice, index) => {
        console.log(`${index}: ${voice.name} (${voice.lang}) - ${voice.default ? "Default" : ""}`);
    });
};

function loadVoices() {
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();

    console.log("🔍 Checking available voices:", voices.length);

    if (voices.length === 0) {
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.warn(`⚠️ Voices not loaded yet. Retrying in 200ms... (${retryCount}/${MAX_RETRIES})`);
            setTimeout(loadVoices, 200);
        } else {
            console.error("❌ Max retries reached. No voices available.");
        }
        return;
    }

    retryCount = 0; // Reset retry count on success

    const voiceSelect = document.getElementById("voiceSelect");
    if (!voiceSelect) {
        console.error("❌ voiceSelect element not found.");
        return;
    }

    voiceSelect.innerHTML = ""; // Clear previous options

    // ✅ Filter voices to show only "Google UK English Male" and "Microsoft Mark"
    const allowedVoices = voices.filter(voice =>
        voice.name.includes("Microsoft Mark") || voice.name.includes("Google UK English Male")
    );

    if (allowedVoices.length === 0) {
        console.warn("⚠️ No matching voices found. Showing all voices.");
    }

    allowedVoices.forEach(voice => {
        let option = document.createElement("option");
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });

    // ✅ Auto-select first voice in the list
    if (allowedVoices.length > 0) {
        voiceSelect.value = allowedVoices[0].name;
        console.log("✅ Selected voice:", voiceSelect.value);
    }
}

// ✅ Ensure voices load when available
window.speechSynthesis.onvoiceschanged = loadVoices;

// Manually call `loadVoices()` as a fallback if `onvoiceschanged` doesn’t fire
setTimeout(() => {
    console.log("⏳ Manually calling loadVoices() as a fallback.");
    loadVoices();
}, 1000);

// ✅ Speak using the selected voice
function speakText() {
    const selectedVoice = document.getElementById("voiceSelect").value;
    speakUsingBrowserTTS("Hello! How are you?", selectedVoice);
}

window.addEventListener("resize", function () {
    engine.resize();
});
