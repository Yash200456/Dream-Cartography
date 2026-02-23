import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Mic, Square, MapPin } from 'lucide-react';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const App = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [landmarks, setLandmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Ready");

  const svgRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationRef = useRef(null);
  const recognitionRef = useRef(null);

  const startRecording = async () => {
    try {
      // 1. Start Audio Visualizer
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      
      // 2. Start Speech Recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        alert("Your browser does not support Voice-to-Text. Please type your dream instead.");
        setIsRecording(true); // Allow visualizer to run even if speech fails
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onstart = () => setStatusMsg("Listening... Speak clearly.");
      
      recognition.onresult = (event) => {
        let currentTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event) => {
        console.error("Speech Error:", event.error);
        setStatusMsg(`Error: ${event.error}. Please type manually below.`);
      };

      recognition.start();
      recognitionRef.current = recognition;

      setIsRecording(true);
      draw(); 
    } catch (err) {
      console.error("Error:", err);
      alert("Microphone access denied. Please allow permissions in browser settings.");
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    setStatusMsg("Processing...");
    if (audioContextRef.current) audioContextRef.current.close();
    if (recognitionRef.current) recognitionRef.current.stop();
    cancelAnimationFrame(animationRef.current);
    
    await generateLandmarks();
  };

  const generateLandmarks = async () => {
    if (!transcript) {
      setStatusMsg("No text detected. Try typing your dream.");
      return;
    }
    
    setIsLoading(true);
    setStatusMsg("Summoning Cartographer...");

    try {
     const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });;
      const prompt = `
        I have a fantasy map shaped like an island. 
        The user narrated this dream/story: "${transcript}".
        
        Extract 3 to 5 distinct fantasy locations from this text.
        For each location, generate:
        1. A fantasy name.
        2. A type (forest, castle, mountain, lake).
        3. Coordinates (x, y) where x is between -80 and 80, and y is between -80 and 80.
        
        Return ONLY a JSON array. Example:
        [{"name": "Forest of Whispers", "type": "forest", "x": 20, "y": -40}]
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonString = text.replace(/```json|```/g, "").trim();
      const locations = JSON.parse(jsonString);
      
      setLandmarks(locations);
      setStatusMsg("Map Generated.");
    } catch (error) {
      console.error("AI Error:", error);
      setStatusMsg("AI Error. Check Console.");
    } finally {
      setIsLoading(false);
    }
  };

  const draw = () => {
    if (!analyserRef.current) return;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const data = Array.from(dataArrayRef.current).slice(0, 150); 
    
    const width = 400;
    const height = 400;
    const radius = 100;

    const svg = d3.select(svgRef.current);
    const layer = svg.select(".island-layer");
    layer.selectAll("*").remove(); 

    const lineGenerator = d3.lineRadial()
      .angle((d, i) => (i / data.length) * 2 * Math.PI) 
      .radius(d => radius + (d * 0.6)) 
      .curve(d3.curveBasisClosed); 

    layer.append("path")
      .datum(data)
      .attr("d", lineGenerator)
      .attr("transform", `translate(${width / 2}, ${height / 2})`)
      .attr("fill", "#d4c5a9") 
      .attr("stroke", "#4a3c31") 
      .attr("stroke-width", 3)
      .attr("filter", "url(#rough-paper)");
      
    animationRef.current = requestAnimationFrame(draw);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-stone-900 text-white font-sans p-4">
      <h1 className="text-4xl font-bold mb-4 tracking-widest text-stone-300">DREAM CARTOGRAPHY</h1>
      
      <div className="relative border-4 border-stone-700 rounded-xl bg-stone-800 shadow-2xl p-4">
        <svg ref={svgRef} width={400} height={400} className="bg-stone-800 rounded-full">
          <defs>
            <filter id="rough-paper">
              <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" />
            </filter>
          </defs>
          <g className="island-layer"></g>
          <g transform="translate(200, 200)">
            {landmarks.map((loc, i) => (
              <g key={i} transform={`translate(${loc.x}, ${loc.y})`}>
                <circle r="4" fill="#8B0000" />
                <text y="-8" textAnchor="middle" fontSize="10" fill="#f5f5f4" className="font-bold drop-shadow-md">
                  {loc.name}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl z-20">
            <span className="text-xl animate-pulse font-bold text-emerald-400">Summoning Cartographer...</span>
          </div>
        )}
      </div>

      {/* STATUS & MANUAL INPUT */}
      <div className="mt-6 w-full max-w-md flex flex-col gap-2">
        <div className="text-center text-stone-400 text-sm font-mono">{statusMsg}</div>
        
        <textarea 
          className="w-full bg-stone-800 border border-stone-600 rounded p-2 text-stone-300 text-sm focus:outline-none focus:border-emerald-500"
          rows="3"
          placeholder="Narrate here if voice fails... (e.g., 'I saw a dark tower...')"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </div>

      <div className="mt-6">
        {!isRecording ? (
          <button onClick={startRecording} className="flex items-center gap-3 px-8 py-4 bg-emerald-600 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-emerald-900/50">
            <Mic size={24} /> Start Narrating
          </button>
        ) : (
          <button onClick={stopRecording} className="flex items-center gap-3 px-8 py-4 bg-rose-600 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-rose-900/50">
            <Square size={24} /> Generate Map
          </button>
        )}
      </div>
    </div>
  );
};

export default App;