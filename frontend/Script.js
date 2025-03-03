const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);
let avatarMeshes; // Global storage for the avatar meshes
let idleAnim, talkingAnim1, talkingAnim2;
let lastUserInputTime = Date.now();
let idleTimeout;
let currentAnimation = null;
let talking = false; // Track if the avatar is talking
let isSpeaking = false; // Prevent multiple executions
let animationTimeout = null;
let mouthInterval = null;
let blinkIntervals = [];
let animationGroups;

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
                    // Clear only this mesh's intervals
                    const existing = blinkIntervals.filter(i => i.mesh === mesh);
                    existing.forEach(clearInterval);
                    blinkIntervals = blinkIntervals.filter(i => !existing.includes(i));

                    // Store interval with mesh reference
                    const interval = setInterval(() => {
                        blinkTarget.influence = 1;
                        setTimeout(() => blinkTarget.influence = 0, 200);
                    }, 5000);
    
                    blinkIntervals.push({ interval, mesh });
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
    if (!newAnimation || currentAnimation === newAnimation) return;
    if (currentAnimation === newAnimation) return;

    // Clear any pending animation changes
    if (animationTimeout) clearTimeout(animationTimeout);

    if (currentAnimation) {
        currentAnimation.stop();
    }

    const shouldLoop = newAnimation === idleAnim;
    newAnimation.start(shouldLoop, 1.0, newAnimation.from, newAnimation.to, false);

    scene.animationPropertiesOverride = new BABYLON.AnimationPropertiesOverride();
    scene.animationPropertiesOverride.enableBlending = true;
    scene.animationPropertiesOverride.blendingSpeed = 0.1; // Smooth blending
    
    currentAnimation = newAnimation;

    if (talking && (newAnimation === talkingAnim1 || newAnimation === talkingAnim2)) {
        newAnimation.onAnimationEndObservable.addOnce(() => {
            if (talking) {
                const delay = Math.random() * 2000 + 1000; // 1-3s delay
                animationTimeout = setTimeout(() => {
                    const nextAnim = currentAnimation === talkingAnim1 ? talkingAnim2 : talkingAnim1;
                    playAnimation(nextAnim);
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
    try {
        sendButton.disabled = true;
        
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userInput, user_id: "default" })
        });

        if (!response.ok) {
            console.error("Failed to fetch response");
            return;
        }

        const data = await response.json();
        document.getElementById("response").innerText = data.response;

        if (data.use_browser_tts) {
            await new Promise(resolve => {
                speakUsingBrowserTTS(data.response, undefined, () => {
                    sendButton.disabled = false;
                    resolve();
                });
            });
        } else if (data.audio_blob) {
            await new Promise(resolve => {
                const audio = new Audio(URL.createObjectURL(
                    new Blob([Uint8Array.from(atob(data.audio_blob), c => c.charCodeAt(0))],
                    { type: "audio/mpeg" }
                )));
                audio.onended = () => {
                    sendButton.disabled = false;
                    resolve();
                };
                audio.play();
            });
        }
    } catch (err) {
        console.error("Error:", err);
        sendButton.disabled = false;
    }
}



function updateMouthMovement() {
    const talkingMeshes = ["Wolf3D_Head", "Wolf3D_Teeth"];
    
    // Clear any existing interval properly
    if (mouthInterval) {
        clearInterval(mouthInterval);
        mouthInterval = null;
    }

    if (talking) {
        mouthInterval = setInterval(() => {
            avatarMeshes.forEach(mesh => {
                if (talkingMeshes.includes(mesh.name) && mesh.morphTargetManager) {
                    const mouthOpen = mesh.morphTargetManager.getTargetByName("mouthOpen");
                    if (mouthOpen) {
                        mouthOpen.influence = Math.random() * 0.8;
                    }
                }
            });
        }, 100);
    } else {
        avatarMeshes.forEach(mesh => {
            if (talkingMeshes.includes(mesh.name) && mesh.morphTargetManager) {
                const mouthOpen = mesh.morphTargetManager.getTargetByName("mouthOpen");
                if (mouthOpen) mouthOpen.influence = 0;
            }
        });
    }
}


function speakUsingBrowserTTS(text, voiceName = "Google UK English Male", callback = null) {
    
    if (isSpeaking) {
        console.warn("Already speaking, ignoring duplicate call.");
        return;
    }

     const unlockAudio = () => {
        if (typeof window.AudioContext !== "undefined") {
            const context = new window.AudioContext();
            const oscillator = context.createOscillator();
            oscillator.connect(context.destination);
            oscillator.start(0);
            oscillator.stop(0.001);
        }
    };
    unlockAudio();
    isSpeaking = true;
    const synth = window.speechSynthesis;

    if (!synth) {
        console.error("Web Speech API not supported");
        isSpeaking = false;
        if (callback) callback();
        return;
    }

    // ✅ Wait for voices to load with proper retry handling
    const loadVoices = () => {
        const voices = synth.getVoices();
        if (voices.length === 0) {
            setTimeout(loadVoices, 200);
            return;
        }

        // First try preferred voices
        let allowedVoices = voices.filter(voice => 
            voice.lang.startsWith('en') // Prioritize English voices
        );

        // Fallback to all voices if none found
        if (allowedVoices.length === 0) {
            console.warn("No preferred voices found, using all available voices");
            allowedVoices = voices;
        }

        // Ensure we have voices after fallback
        if (allowedVoices.length === 0) {
            console.error("No voices available at all");
            isSpeaking = false;
            if (callback) callback();
            return;
        }

        const selectedVoice = allowedVoices.find(v => v.name === voiceName) 
            || allowedVoices.find(v => v.default) 
            || allowedVoices[0];
        processSentences(text, selectedVoice, callback);
    };

    loadVoices();
}

function processSentences(text, voice, callback) {
    const synth = window.speechSynthesis;
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentIndex = 0;

    function speakNext() {
        if (currentIndex >= sentences.length) {
            finishSpeaking();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(sentences[currentIndex].trim());
        utterance.voice = voice;
        utterance.rate = 0.9;
        utterance.volume = 1;
        utterance.pitch = 1;

        utterance.onstart = () => {
            talking = true;
            playAnimation(talkingAnim1);
            updateMouthMovement();
        };

        utterance.onerror = (err) => {
            console.error("Speech error:", err);
            finishSpeaking();
        };

        utterance.onend = () => {
            currentIndex++;
            setTimeout(speakNext, 100);
        };

        synth.speak(utterance);
    }

    function finishSpeaking() {
        isSpeaking = false;
        talking = false;
        playAnimation(idleAnim);
        updateMouthMovement();
        if (callback) callback();
    }

    synth.cancel();
    speakNext();
}

function initializeVoices() {
    const synth = window.speechSynthesis;
    
    const handleVoicesChanged = () => {
        const voices = synth.getVoices();
        console.log("Available Voices:", voices);
        populateVoiceSelect(voices);
    };

    // Set up single event handler
    synth.onvoiceschanged = handleVoicesChanged;
    
    // Initial load if voices already available
    if (synth.getVoices().length > 0) {
        handleVoicesChanged();
    }
}


function populateVoiceSelect(voices) {
    const voiceSelect = document.getElementById("voiceSelect");
    if (!voiceSelect) return;

    voiceSelect.disabled = false; 
    voiceSelect.innerHTML = "";

    if (voices.length === 0) {
        const option = document.createElement("option");
        option.textContent = "No voices available";
        voiceSelect.appendChild(option);
        voiceSelect.disabled = true;
        return;
    }

    // First try preferred voices
    let allowedVoices = voices.filter(v => 
        v.lang.startsWith('en') // Only English variants
    );

    // Fallback to all voices if none found
    if (allowedVoices.length === 0) {
        console.warn("No preferred voices found, using all available voices");
        allowedVoices = voices;
    }

    // Populate dropdown
    allowedVoices.forEach(voice => {
        const option = document.createElement("option");
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });

    if (allowedVoices.length > 0) {
        voiceSelect.value = allowedVoices[0].name;
    }
}

window.speakText = function() {
    const selectedVoice = document.getElementById("voiceSelect").value;
    speakUsingBrowserTTS("Hello! How are you?", selectedVoice);
}


// Initialize when ready
document.addEventListener('DOMContentLoaded', initializeVoices)


// Add this to handle scene cleanup
function cleanup() {
    if (mouthInterval) clearInterval(mouthInterval);
    blinkIntervals.forEach(clearInterval);
    if (animationTimeout) clearTimeout(animationTimeout);
    
    // Proper Babylon.js cleanup
    engine.stopRenderLoop();
    scene.dispose();
    engine.dispose();
    
    // Cleanup Web Audio
    if (window.AudioContext) {
        const audioContext = new AudioContext();
        audioContext.close();
    }

    // Cleanup TTS
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

// Handle window close/unload
window.addEventListener("beforeunload", cleanup);

window.addEventListener("resize", function () {
    engine.resize();
});
