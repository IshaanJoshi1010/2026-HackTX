import { StrictMode, useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CarStage, preloadCars, type CarStageProps } from "../../ui/3d/CarStage";
import type { WebGLRenderer } from "three";
import type { VehicleConfig } from "../../contracts";

const camry: VehicleConfig = { id: "camry-2022-se", make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas", paint: "#535862", mpg: 32, seats: 5, cargoCuFt: 15.1, msrp: 26000, modelAsset: "/models/camry-v80.glb", matchStatus: "representative", specSources: [] };
const rav4: VehicleConfig = { ...camry, id: "rav4-2024-hybrid-xle", model: "RAV4", year: 2024, trim: "Hybrid XLE", powertrain: "hybrid", modelAsset: "/models/rav4-hybrid-2024-xle.glb" };

function Preview() {
  const [mounted, setMounted] = useState(true);
  const [vehicle, setVehicle] = useState(camry);
  const [audit, setAudit] = useState("Not run");
  const [memory, setMemory] = useState("");
  const renderer = useRef<WebGLRenderer | null>(null);
  const auditRunning = useRef(false);
  const animationDone = useRef<(() => void) | null>(null);
  useEffect(() => {
    const capture = (event: Event) => { renderer.current = (event as CustomEvent<WebGLRenderer>).detail; };
    window.addEventListener("fork:3d-renderer", capture);
    const timer = setInterval(() => {
      const info=renderer.current?.info;
      if(info) setMemory(`Geometries ${info.memory.geometries} / Textures ${info.memory.textures} / Calls ${info.render.calls} / Triangles ${info.render.triangles}`);
    }, 500);
    return () => {clearInterval(timer);window.removeEventListener("fork:3d-renderer",capture);auditRunning.current=false;};
  }, []);
  async function runAudit() {
    if(auditRunning.current)return;
    auditRunning.current=true;
    const results=[];
    const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
    for(let index=0;index<10 && auditRunning.current;index++) {
      setMounted(true);setVehicle(index%2?rav4:camry);setPhase("interactive");
      setAudit(`Cycle ${index+1}/10: mounting`);
      await wait(2400);
      const gl=renderer.current;
      const before=gl?{...gl.info.memory}:null;
      setMounted(false);setAudit(`Cycle ${index+1}/10: unmounting`);
      await wait(1600);
      const after=gl?{...gl.info.memory}:null;
      results.push({cycle:index+1,before,after});
      setAudit(JSON.stringify(results));
    }
    setAudit(JSON.stringify(results));auditRunning.current=false;setMounted(true);
  }
  async function runAnimationAudit(kind: "reveal" | "morph") {
    if (auditRunning.current) return;
    auditRunning.current = true;
    const results = [];
    try {
      await preloadCars([camry, rav4]); setMounted(true); setView("solid");
      for (let i = 0; i < 10; i++) {
        const finished = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { animationDone.current = null; reject(new Error("Animation timed out")); }, 12000);
          animationDone.current = () => { clearTimeout(timeout); resolve(); };
        });
        setAudit(`${kind} ${i + 1}/10`);
        if (kind === "reveal") { setPhase("reveal"); setReplay(value => value + 1); }
        else { setTarget(i % 2 ? camry : rav4); setPhase("transition"); setReplay(value => value + 1); }
        await finished;
        await new Promise(resolve => setTimeout(resolve, 350));
        results.push({ cycle: i + 1, memory: { ...renderer.current!.info.memory } });
      }
      setAudit(JSON.stringify({ kind, results }));
    } catch (error) { setAudit(String(error)); }
    finally { auditRunning.current = false; animationDone.current = null; }
  }
  const [phase, setPhase] = useState<CarStageProps["phase"]>("interactive");
  const [target, setTarget] = useState(rav4);
  const [viewMode, setView] = useState<CarStageProps["viewMode"]>("solid");
  const [skip, setSkip] = useState(0);
  const [replay, setReplay] = useState(0);
  const [reset, setReset] = useState(0);
  const [reducedMotion, setReduced] = useState(false);
  const [low, setLow] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const append = (event: string) => setEvents((previous) => [...previous.slice(-11), event]);
  return <main style={{ padding: 24 }}>
    <h1>CarStage integration check</h1><p>Representative models / synthetic paint / sampled points and shader reveal.</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <button onClick={() => {void preloadCars([camry,rav4]).then(()=>append("Both model assets preloaded"),error=>append(String(error)));}}>Preload both cars</button>
      <button onClick={() => { setEvents([]); setPhase("reveal"); setReplay(replay + 1); }}>Replay reveal</button>
      <button onClick={() => setSkip(skip + 1)}>Skip</button>
      <button onClick={() => { setTarget(vehicle.id === camry.id ? rav4 : camry); setPhase("transition"); setReplay(replay + 1); }}>Morph to other car</button>
      <button onClick={() => {setPhase("interactive");setVehicle(camry);}}>Camry</button>
      <button onClick={() => {setPhase("interactive");setVehicle(rav4);}}>RAV4</button>
      <button onClick={() => setVehicle({...vehicle,paint:vehicle.paint==="#cc2222"?"#535862":"#cc2222"})}>Toggle red paint</button>
      <button onClick={() => setVehicle({...vehicle,modelAsset:"/models/not-found.glb"})}>Test missing model</button>
      <button onClick={() => setMounted(!mounted)}>Mount / unmount</button>
      <button onClick={runAudit}>Run 10-cycle memory audit</button>
      <button onClick={() => void runAnimationAudit("reveal")}>Audit 10 reveals</button>
      <button onClick={() => void runAnimationAudit("morph")}>Audit 10 morphs</button>
      <button onClick={() => setReset(reset + 1)}>Reset camera</button>
      <label>View <select value={viewMode} onChange={(event) => setView(event.target.value as CarStageProps["viewMode"])}><option>solid</option><option>wireframe</option><option>points</option></select></label>
      <label><input type="checkbox" checked={reducedMotion} onChange={(event) => setReduced(event.target.checked)} />Reduced motion</label>
      <label><input type="checkbox" checked={low} onChange={(event) => setLow(event.target.checked)} />Low quality</label>
    </div>
    <div style={{ height: "55vh", minHeight: 320 }}>{mounted && <CarStage vehicle={vehicle} transitionTo={target} phase={phase} viewMode={viewMode} quality={low ? "low" : "high"} reducedMotion={reducedMotion} skipSignal={skip} replaySignal={replay} resetCameraSignal={reset} onRevealStage={(stage) => { append(stage); if (stage === "done") animationDone.current?.(); }} onTransitionComplete={() => { append("transition complete"); setVehicle(target); setPhase("interactive"); animationDone.current?.(); }} onModelStatus={(status) => append(`${status.vehicleId}: ${status.ready ? "ready" : status.error || "loading"}`)} />}</div>
    <p>{memory}</p><pre style={{whiteSpace:"pre-wrap",fontSize:11}}>{audit}</pre>
    <p role="status">{events.join(" / ") || "Waiting for callbacks"}</p>
  </main>;
}

const previewRoot = createRoot(document.getElementById("root")!);
previewRoot.render(<StrictMode><Preview /></StrictMode>);
const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(() => previewRoot.unmount());
