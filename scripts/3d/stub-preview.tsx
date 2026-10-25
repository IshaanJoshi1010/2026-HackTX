import "./showroom.css";
import { StrictMode, useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CarStage, preloadCars, type CarStageProps } from "../../ui/3d/CarStage";
import { MaintenanceProvider } from "../../ui/3d/maintenance";
import type { WebGLRenderer } from "three";
import type { VehicleConfig } from "../../contracts";

const camry: VehicleConfig = { id: "camry-2022-se", make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas", paint: "#535862", mpg: 32, seats: 5, cargoCuFt: 15.1, msrp: 26000, modelAsset: "/models/camry-v80.glb", matchStatus: "representative", specSources: [] };
const rav4: VehicleConfig = { ...camry, id: "rav4-2024-hybrid-xle", model: "RAV4", year: 2024, trim: "Hybrid XLE", powertrain: "hybrid", modelAsset: "/models/rav4-hybrid-2024-xle.glb" };

function Preview() {
  const [mounted, setMounted] = useState(true);
  const [vehicle, setVehicle] = useState(camry);
  const [audit, setAudit] = useState("Not run");
  const [memory, setMemory] = useState("");
  const [performanceText, setPerformanceText] = useState("");
  const [resolution, setResolution] = useState("responsive");
  const frameSamples = useRef<{ fps: number; worstFrameMs: number; width: number; height: number }[]>([]);
  const renderer = useRef<WebGLRenderer | null>(null);
  const auditRunning = useRef(false);
  const animationDone = useRef<(() => void) | null>(null);
  useEffect(() => {
    const capture = (event: Event) => { renderer.current = (event as CustomEvent<WebGLRenderer>).detail; };
    window.addEventListener("fork:3d-renderer", capture);
    const measure = (event: Event) => {
      const sample = (event as CustomEvent).detail;
      frameSamples.current.push(sample);
      if (frameSamples.current.length > 120) frameSamples.current.shift();
      setPerformanceText(`FPS ${sample.fps.toFixed(1)} / worst frame ${sample.worstFrameMs.toFixed(1)} ms / buffer ${sample.width}x${sample.height}`);
    };
    window.addEventListener("fork:3d-performance", measure);
    const timer = setInterval(() => {
      const info=renderer.current?.info;
      if(info) setMemory(`Geometries ${info.memory.geometries} / Textures ${info.memory.textures} / Calls ${info.render.calls} / Triangles ${info.render.triangles}`);
    }, 500);
    return () => {clearInterval(timer);window.removeEventListener("fork:3d-renderer",capture);window.removeEventListener("fork:3d-performance",measure);auditRunning.current=false;};
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
  async function runSwitchAudit() {
    if (auditRunning.current) return;
    auditRunning.current = true;
    const results = [];
    try {
      await preloadCars([camry, rav4]); setMounted(true); setPhase("interactive"); setView("solid");
      frameSamples.current = [];
      for (let i = 0; i < 20 && auditRunning.current; i++) {
        setVehicle(i % 2 ? camry : rav4); setAudit(`Switch ${i + 1}/20`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        results.push({ cycle: i + 1, memory: { ...renderer.current!.info.memory }, calls: renderer.current!.info.render.calls });
      }
      setAudit(JSON.stringify({ kind: "switch", quality: low ? "low" : "high", reducedMotion, resolution, results, frames: frameSamples.current }));
    } catch (error) { setAudit(String(error)); }
    finally { auditRunning.current = false; }
  }
  const [target, setTarget] = useState(rav4);
  const [viewMode, setView] = useState<CarStageProps["viewMode"]>("solid");
  const [skip, setSkip] = useState(0);
  const [replay, setReplay] = useState(0);
  const [reset, setReset] = useState(0);
  const [reducedMotion, setReduced] = useState(false);
  const [low, setLow] = useState(false);
  const [demoWarning, setDemoWarning] = useState(false);
  const [revealStage, setRevealStage] = useState("Ready");
  const [events, setEvents] = useState<string[]>([]);
  const append = (event: string) => setEvents((previous) => [...previous.slice(-11), event]);
  return <MaintenanceProvider findings={demoWarning ? [{ vehicleId: vehicle.id, component: "brakes", severity: "warning", label: "Brake inspection requested", source: "Synthetic demo finding, not a diagnosis" }] : []}><main className="showroom">
    <header className="showroom-header"><a className="wordmark" href="#">F<span>O</span>RK<span className="brand-dot">.</span></a><div className="header-note">A NEW PERSPECTIVE ON WHAT&apos;S NEXT</div><span className="live-badge"><i /> INTERACTIVE STUDIO</span></header>
    <section className="intro"><div><p className="eyebrow">THE NEXT CHAPTER</p><h1>See the possibilities<span>.</span></h1><p className="subtitle">Two Toyotas. A different point of view. Explore the details, then watch one future become another.</p></div><div className="edition"><span>{vehicle.id === camry.id ? "01 / 02" : "02 / 02"}</span><p>THE TOYOTA COLLECTION</p></div></section>
    <div className="showroom-controls">
      <div className="vehicle-tabs" role="group" aria-label="Choose vehicle">
        <button aria-pressed={vehicle.id === camry.id} onClick={() => {setPhase("interactive");setVehicle(camry);setRevealStage("Ready");}}>Camry <span>SEDAN</span></button>
        <button aria-pressed={vehicle.id === rav4.id} onClick={() => {setPhase("interactive");setVehicle(rav4);setRevealStage("Ready");}}>RAV4 <span>HYBRID SUV</span></button>
      </div>
      <div className="view-tabs" role="group" aria-label="View mode">{(["solid","wireframe"] as const).map(mode => <button key={mode} aria-pressed={viewMode === mode} onClick={() => {setPhase("interactive");setView(mode);setRevealStage("Ready");}}>{mode === "solid" ? "Studio" : "Structure"}</button>)}</div>
      <button className="reveal-button" onClick={() => {setEvents([]);setView("solid");setPhase("reveal");setReplay(value => value + 1);}}>Replay reveal <span aria-hidden="true">↻</span></button>
    </div>
    <div className="stage-frame" style={{ height: resolution === "responsive" ? "min(66vh, 720px)" : Number(resolution.split("x")[1]), width: resolution === "responsive" ? "100%" : Number(resolution.split("x")[0]), minHeight: 360 }}>{mounted && <CarStage vehicle={vehicle} transitionTo={target} phase={phase} viewMode={viewMode} quality={low ? "low" : "high"} reducedMotion={reducedMotion} skipSignal={skip} replaySignal={replay} resetCameraSignal={reset} onRevealStage={(stage) => {setRevealStage(stage);append(stage);if(stage === "done") animationDone.current?.();}} onTransitionComplete={() => {append("transition complete");setVehicle(target);setPhase("interactive");setRevealStage("Ready");animationDone.current?.();}} onModelStatus={(status) => append(`${status.vehicleId}: ${status.ready ? "ready" : status.error || "loading"}`)} />}</div>
    <div className="stage-footer"><span><i className="status-dot" />{phase === "transition" ? "Transforming your perspective" : revealStage === "done" || revealStage === "Ready" ? "Drag to explore · Scroll to zoom" : `${revealStage} · Building your perspective`}</span><button className="text-button" onClick={() => setSkip(value => value + 1)}>Skip animation →</button></div>
    <section className="experience-bar">
      <div className="paint-picker"><p className="eyebrow">EXPLORE A FINISH <span>ILLUSTRATIVE</span></p><div className="swatches">{[{name:"Graphite",hex:"#535862"},{name:"Pearl",hex:"#d5d8dc"},{name:"Crimson",hex:"#8f1523"},{name:"Midnight",hex:"#151a21"}].map(paint => <button key={paint.hex} aria-label={`${paint.name} paint`} aria-pressed={vehicle.paint === paint.hex} title={paint.name} style={{"--swatch":paint.hex} as React.CSSProperties} onClick={() => {setPhase("interactive");setVehicle({...vehicle,paint:paint.hex});}} />)}<span>{vehicle.paint === "#535862" ? "Graphite" : vehicle.paint === "#d5d8dc" ? "Pearl" : vehicle.paint === "#8f1523" ? "Crimson" : "Midnight"}</span></div></div>
      <div className="motion-options"><label><input type="checkbox" checked={reducedMotion} onChange={event => setReduced(event.target.checked)} />Reduced motion</label><label><input type="checkbox" checked={low} onChange={event => setLow(event.target.checked)} />Performance mode</label></div>
      <button className="morph-button" onClick={() => {setView("solid");setTarget(vehicle.id === camry.id ? rav4 : camry);setPhase("transition");setReplay(value => value + 1);}}>Explore {vehicle.id === camry.id ? "RAV4" : "Camry"}<span aria-hidden="true">↗</span></button>
    </section>
    {viewMode === "wireframe" && <label className="disclosure"><input type="checkbox" checked={demoWarning} onChange={event => setDemoWarning(event.target.checked)} />Preview a synthetic brake warning</label>}
    <div className="disclosure"><span>REPRESENTATIVE MODELS</span><p>Visual explorations, not verified matches to a specific year or trim. Paint previews are illustrative.</p></div>
    <details className="lab"><summary>Studio diagnostics <span>Tools & performance</span></summary><div className="lab-controls">
      <button onClick={() => void preloadCars([camry,rav4]).then(()=>append("Both assets preloaded"),error=>append(String(error)))}>Preload both cars</button>
      <button onClick={() => setVehicle({...vehicle,modelAsset:"/models/not-found.glb"})}>Test missing model</button><button onClick={() => setMounted(!mounted)}>Mount / unmount</button>
      <button onClick={runAudit}>Run 10-cycle memory audit</button><button onClick={() => void runAnimationAudit("reveal")}>Audit 10 reveals</button><button onClick={() => void runAnimationAudit("morph")}>Audit 10 morphs</button><button onClick={() => void runSwitchAudit()}>Audit 20 switches</button><button onClick={() => setReset(value => value + 1)}>Reset camera</button>
      <label>Stage size <select aria-label="Stage size" value={resolution} onChange={event => setResolution(event.target.value)}><option>responsive</option><option>1024x768</option><option>1280x720</option><option>1920x1080</option></select></label></div>
      <p className="telemetry">{memory} / {performanceText}</p><pre>{audit}</pre><p role="status">{events.join(" / ") || "Waiting for callbacks"}</p></details>
    <footer className="page-footer"><span>FORK / HACKTX 2026</span><span>THE FUTURE BRANCHES. EXPLORE YOURS.</span></footer>
  </main></MaintenanceProvider>;

}

const previewRoot = createRoot(document.getElementById("root")!);
previewRoot.render(<StrictMode><Preview /></StrictMode>);
const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(() => previewRoot.unmount());
