"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Box, Expand, Minus, Move, Plus, RotateCcw } from "lucide-react";
import type { InvestigatedWallet, Relationship } from "@/lib/investigation-types";
import { selectSceneWallets } from "@/lib/scene-selection";
import "./universe3d.css";

export type UniverseSelection = { kind: "wallet" | "relationship" | "group"; id: string; wallets?: string[]; evidenceIds?: string[] };
type Props = { wallets: InvestigatedWallet[]; relationships: Relationship[]; selected: string | null; onSelect: (selection: UniverseSelection) => void; paused: boolean; activeWallet?: string | null };
type Point = { wallet: InvestigatedWallet; x: number; y: number; z: number; r: number; color: string };
type Group = { id: string; wallets: string[]; evidenceIds: string[] };
const trim = (address: string) => address.length > 17 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
const share = (value: number | null) => value == null ? "Share unknown" : `${value > 0 && value < 0.01 ? "<0.01" : value.toFixed(2)}%`;
const categoryColor = (w: InvestigatedWallet) => w.categories.some(c => ["sniper", "coordinated-seller"].includes(c)) ? "#b28c6c" : w.categories.some(c => ["creator", "authority", "deployer-linked", "shared-funder"].includes(c)) ? "#b5a784" : w.categories.some(c => ["pool", "bridge", "exchange", "contract", "burn"].includes(c)) ? "#9baca4" : "#7fae99";

function layout(wallets: InvestigatedWallet[], relationships: Relationship[]) {
  const ranked = [...wallets].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  const points: Point[] = ranked.map((wallet, i) => {
    const angle = i * 2.39996, distance = Math.sqrt(i) * 3.5;
    return { wallet, x: Math.cos(angle) * distance, y: Math.sin(i * 1.83) * 0.7, z: Math.sin(angle) * distance * 0.66, r: Math.max(0.68, Math.sqrt(Math.max(0, wallet.share ?? 0)) * 0.38), color: categoryColor(wallet) };
  });
  const byId = new Map(points.map(p => [p.wallet.address, p]));
  const links = relationships.filter(r => r.evidenceIds.length && byId.has(r.from) && byId.has(r.to));
  const bound = Math.max(11, Math.sqrt(points.length) * 2.1);
  for (let step = 0; step < 45; step++) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      for (let j = i + 1; j < points.length; j++) {
        const b = points[j], dx = a.x - b.x || 0.01, dz = a.z - b.z || 0.01, d = Math.hypot(dx, dz);
        const min = a.r + b.r + 2.1;
        if (d < min) { const push = (min - d) * 0.24; a.x += dx / d * push; a.z += dz / d * push; b.x -= dx / d * push; b.z -= dz / d * push; }
      }
      a.x *= 0.998; a.z *= 0.998;
      a.x = THREE.MathUtils.clamp(a.x, -bound + a.r, bound - a.r);
      a.z = THREE.MathUtils.clamp(a.z, -bound * 0.7 + a.r, bound * 0.7 - a.r);
    }
    for (const link of links) {
      const a = byId.get(link.from)!, b = byId.get(link.to)!;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), wanted = a.r + b.r + 3;
      if (d > wanted) { const pull = (d - wanted) * 0.006; a.x += dx / d * pull; a.z += dz / d * pull; b.x -= dx / d * pull; b.z -= dz / d * pull; }
    }
  }
  const linked = links.filter(r => r.kind === "shared-funder" || r.kind === "deployer-linked");
  const visited = new Set<string>(), groups: Group[] = [];
  for (const root of points) {
    if (visited.has(root.wallet.address) || !linked.some(r => r.from === root.wallet.address || r.to === root.wallet.address)) continue;
    const queue = [root.wallet.address], members: string[] = [], evidence = new Set<string>();
    while (queue.length) {
      const id = queue.pop()!; if (visited.has(id)) continue; visited.add(id); members.push(id);
      for (const link of linked) if (link.from === id || link.to === id) { link.evidenceIds.forEach(e => evidence.add(e)); queue.push(link.from === id ? link.to : link.from); }
    }
    if (members.length > 1) groups.push({ id: `group:${members.slice().sort().join(":")}`, wallets: members, evidenceIds: [...evidence] });
  }
  return { points, links, groups, bound };
}

export default function Universe3D({ wallets, relationships, selected, onSelect, paused, activeWallet }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null), controller = useRef<{ reset: () => void; zoom: (amount: number) => void; highlight: () => void } | null>(null);
  const [mode, setMode] = useState<"3d" | "2d">("3d"), [error, setError] = useState(""), [hover, setHover] = useState("");
  const [flatZoom, setFlatZoom] = useState(1);
  const rendered = useRef<{ wallets: InvestigatedWallet[]; relationships: Relationship[]; nodes: InvestigatedWallet[] } | null>(null);
  const sceneWallets = useMemo(() => {
    const previous = rendered.current;
    const nodes = selectSceneWallets(wallets, relationships, selected, activeWallet,
      previous?.wallets === wallets && previous.relationships === relationships ? previous.nodes : undefined);
    rendered.current = { wallets, relationships, nodes };
    return nodes;
  }, [wallets, relationships, selected, activeWallet]);
  const data = useMemo(() => layout(sceneWallets, relationships), [sceneWallets, relationships]);
  const latest = useRef({ onSelect, paused, selected, activeWallet });
  latest.current = { onSelect, paused, selected, activeWallet };
  useEffect(() => { controller.current?.highlight(); }, [selected, activeWallet, paused]);

  useEffect(() => {
    if (mode !== "3d" || !mount.current || !data.points.length) return;
    const host = mount.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" }); }
    catch { setError("3D rendering is unavailable on this device. The 2D map contains the same evidence."); setMode("2d"); return; }
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#080909');
    const center = new THREE.Vector3();
    for(const p of data.points) center.add(new THREE.Vector3(p.x,0,p.z));
    center.divideScalar(data.points.length);
    const spread = Math.max(5,...data.points.map(p=>Math.hypot(p.x-center.x,p.z-center.z)+p.r));
    const camera = new THREE.PerspectiveCamera(37,1,0.1,300);
    const cameraDistance = Math.max(14,spread*1.95);
    camera.position.copy(center).add(new THREE.Vector3(cameraDistance*.42,cameraDistance*.9,cameraDistance*.85));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
    renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15;
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.domElement.setAttribute('aria-label','3D wallet investigation board. Drag to orbit, scroll to zoom, Shift-drag a block to move it. Arrow keys orbit. Use wallet labels or the table to inspect evidence.');
    renderer.domElement.tabIndex=0; host.appendChild(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.12;
    controls.minPolarAngle=.18; controls.maxPolarAngle=Math.PI*.46; controls.minDistance=7; controls.maxDistance=cameraDistance*2.3;
    controls.target.copy(center); controls.update(); controls.saveState();
    scene.add(new THREE.AmbientLight('#dfe4e2',1.5));
    const key=new THREE.DirectionalLight('#ffffff',3.2); key.position.set(-10,20,9); key.castShadow=true;
    key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-40; key.shadow.camera.right=40; key.shadow.camera.top=40; key.shadow.camera.bottom=-40; key.shadow.normalBias=.04; key.shadow.bias=-.0002; scene.add(key);
    const fill=new THREE.DirectionalLight('#adbdb8',1.2); fill.position.set(12,4,-10); scene.add(fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:'#080909',roughness:1,metalness:0}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-.24; floor.receiveShadow=true; scene.add(floor);
    const meshes=new Map<string,THREE.Mesh>(), halos=new Map<string,THREE.Mesh>();
    const labels=new Map<string,HTMLButtonElement>();
    const labelLayer=document.createElement('div'); labelLayer.className='wallet-label-layer'; host.appendChild(labelLayer);
    const pickable:THREE.Object3D[]=[], lineMeshes:{mesh:THREE.Mesh;relationship:Relationship}[]=[];
    const pointMap=new Map(data.points.map(p=>[p.wallet.address,p]));
    const footprint=(p:Point)=>Math.max(.68,p.r);
    const role=(w:InvestigatedWallet)=>w.categories.includes('sniper')?'Possible sniper':w.categories.includes('authority')?'Authority':w.categories.includes('creator')?'Creator':w.categories.includes('coordinated-seller')?'Connected seller':w.categories.includes('pool')?'Pool':w.categories.includes('exchange')?'Exchange':w.categories.includes('contract')?'Contract':'Wallet';
    for(const p of data.points){
      const r=footprint(p),height=.32+Math.min(.7,r*.25);
      const material=new THREE.MeshStandardMaterial({color:p.wallet.share==null?'#1d2221':'#525b57',roughness:.83,metalness:.18});
      const block=new THREE.Mesh(new THREE.BoxGeometry(r*2,height,r*1.4),material); block.position.set(p.x,height/2,p.z); block.castShadow=true; block.receiveShadow=true;
      block.userData.baseY=height/2;block.userData.targetY=height/2;block.userData.selection={kind:'wallet',id:p.wallet.address}; scene.add(block);meshes.set(p.wallet.address,block);pickable.push(block);
      const bevel=new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry),new THREE.LineBasicMaterial({color:'#87918b',transparent:true,opacity:.45}));block.add(bevel);
      const marker=new THREE.Mesh(new THREE.BoxGeometry(r*1.6,.025,.07),new THREE.MeshBasicMaterial({color:p.color})); marker.position.set(0,height/2+.018,-r*.45);block.add(marker);
      const halo=new THREE.Mesh(new THREE.BoxGeometry(r*2+.1,.04,r*1.4+.1),new THREE.MeshBasicMaterial({color:'#a6d1c0',transparent:true,opacity:0}));halo.position.y=-height/2+.01;block.add(halo);halos.set(p.wallet.address,halo);
      const label=document.createElement('button');label.type='button';label.className='wallet-spatial-label';label.setAttribute('aria-label',`Inspect wallet ${p.wallet.address}`);
      const title=document.createElement('strong');title.textContent=trim(p.wallet.address);const detail=document.createElement('span');detail.textContent=`${role(p.wallet)} / ${share(p.wallet.share).replace('Share unknown','unknown')}`;label.append(title,detail);
      label.onclick=()=>latest.current.onSelect({kind:'wallet',id:p.wallet.address});labelLayer.appendChild(label);labels.set(p.wallet.address,label);
    }
    const curveFor=(relationship:Relationship)=>{
      const a=meshes.get(relationship.from)!.position.clone(),b=meshes.get(relationship.to)!.position.clone();a.y+=.4;b.y+=.4;
      const middle=a.clone().lerp(b,.5);middle.y+=Math.min(1.8,a.distanceTo(b)*.12);return new THREE.QuadraticBezierCurve3(a,middle,b);
    };
    for(const relationship of data.links){
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(curveFor(relationship),24,.025,5,false),new THREE.MeshBasicMaterial({color:relationship.kind==='shared-funder'?'#aa9270':'#7fa494',transparent:true,opacity:.8}));
      mesh.userData.selection={kind:'relationship',id:relationship.id,wallets:[relationship.from,relationship.to],evidenceIds:relationship.evidenceIds};scene.add(mesh);pickable.push(mesh);lineMeshes.push({mesh,relationship});
    }
    for(const group of data.groups){
      const members=group.wallets.map(id=>pointMap.get(id)!);
      const minX=Math.min(...members.map(p=>p.x-footprint(p)))-.5,maxX=Math.max(...members.map(p=>p.x+footprint(p)))+.5,minZ=Math.min(...members.map(p=>p.z-footprint(p)*.7))-.5,maxZ=Math.max(...members.map(p=>p.z+footprint(p)*.7))+.5;
      const tray=new THREE.Mesh(new THREE.BoxGeometry(maxX-minX,.12,maxZ-minZ),new THREE.MeshStandardMaterial({color:'#191917',roughness:.95,metalness:.05}));tray.position.set((minX+maxX)/2,-.12,(minZ+maxZ)/2);tray.receiveShadow=true;tray.userData.selection={kind:'group',...group};scene.add(tray);pickable.push(tray);
      const outline=new THREE.LineSegments(new THREE.EdgesGeometry(tray.geometry),new THREE.LineBasicMaterial({color:'#71654f'}));tray.add(outline);
    }
    const positionLabels=()=>{
      const width=host.clientWidth,height=host.clientHeight,occupied:{x:number;y:number}[]=[];
      const ranked=[...data.points].sort((a,b)=>Number(b.wallet.address===latest.current.selected||b.wallet.address===hoveredWallet)-Number(a.wallet.address===latest.current.selected||a.wallet.address===hoveredWallet));
      for(const p of ranked){
        const label=labels.get(p.wallet.address)!,mesh=meshes.get(p.wallet.address)!;
        const projected=mesh.position.clone().add(new THREE.Vector3(0,.7,0)).project(camera);
        const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height+18;
        const active=p.wallet.address===latest.current.selected||p.wallet.address===hoveredWallet||p.wallet.address===latest.current.activeWallet;
        const fits=projected.z<1&&x>75&&x<width-75&&y>70&&y<height-110&&!occupied.some(o=>Math.abs(o.x-x)<150&&Math.abs(o.y-y)<49);
        const show=fits&&(occupied.length<10||active);label.hidden=!show;
        if(show){label.style.transform=`translate(${Math.round(x-70)}px,${Math.round(y)}px)`;label.dataset.active=String(active);occupied.push({x,y});}
      }
    };
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let frame = 0, disposed = false, needsRender = true, hoveredWallet: string | null = null, down: { x: number; y: number } | null = null, dragged: THREE.Mesh | null = null;
    function schedule() { if (!disposed && !document.hidden && !frame) frame = requestAnimationFrame(animate); }
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), dragOffset = new THREE.Vector3();
    const hit = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(pickable, false)[0];
    };
    function highlight() {
      for (const [id, mesh] of meshes) {
        const active = latest.current.selected === id || latest.current.activeWallet === id || hoveredWallet === id;
        mesh.userData.targetY=mesh.userData.baseY+(active?.18:0); if(latest.current.paused)mesh.position.y=mesh.userData.targetY;
        (mesh.material as THREE.MeshStandardMaterial).color.set(active?'#86a99a':pointMap.get(id)!.wallet.share==null?'#1d2221':'#525b57');
        (halos.get(id)!.material as THREE.MeshBasicMaterial).opacity = active ? .8 : 0;

      }
      for (const { mesh, relationship } of lineMeshes) { const mat = mesh.material as THREE.MeshBasicMaterial; mat.opacity = latest.current.selected === relationship.id ? 1 : 0.65; mat.color.set(latest.current.selected === relationship.id ? "#f5d58f" : relationship.kind === "shared-funder" ? "#c3a15e" : "#4d8982"); }
      needsRender = true; schedule();
    }
    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
      const found = hit(event);
      if (event.shiftKey && found?.object.userData.selection?.kind === "wallet") {
        dragged = found.object as THREE.Mesh; controls.enabled = false; dragPlane.constant = -dragged.position.y;
        const intersection = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3()); if (intersection) dragOffset.copy(dragged.position).sub(intersection);
        renderer.domElement.setPointerCapture(event.pointerId);
      }
    };
    const onMove = (event: PointerEvent) => {
      const found = hit(event);
      if (dragged) {
        const point = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
        if (point) {
          dragged.position.copy(point.add(dragOffset)); dragged.position.x = THREE.MathUtils.clamp(dragged.position.x, -data.bound, data.bound); dragged.position.z = THREE.MathUtils.clamp(dragged.position.z, -data.bound, data.bound);
          const id = dragged.userData.selection.id;
          for (const line of lineMeshes) if (line.relationship.from === id || line.relationship.to === id) { line.mesh.geometry.dispose(); line.mesh.geometry = new THREE.TubeGeometry(curveFor(line.relationship), 36, 0.035, 6, false); }
          needsRender = true; schedule();
        }
        return;
      }
      const selection = found?.object.userData.selection as UniverseSelection | undefined;
      const nextHover = selection?.kind === "wallet" ? selection.id : null;
      if (nextHover !== hoveredWallet) { hoveredWallet = nextHover; highlight(); }
      renderer.domElement.style.cursor = selection ? "pointer" : "grab";
      setHover(selection?.kind === "wallet" ? `${pointMap.get(selection.id)?.wallet.label || trim(selection.id)} - ${share(pointMap.get(selection.id)!.wallet.share)}` : selection?.kind === "relationship" ? "Select connection to inspect transaction evidence" : selection ? "Evidence-linked wallet group - select to inspect" : "");
    };
    const onUp = (event: PointerEvent) => {
      if (dragged) { dragged = null; controls.enabled = true; if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); }
      else if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) { const found = hit(event); if (found?.object.userData.selection) latest.current.onSelect(found.object.userData.selection); }
      down = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (["+", "=", "-", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) event.preventDefault();
      if (event.key === "Home") controls.reset();
      else if (event.key === "+" || event.key === "=") camera.position.lerp(controls.target, 0.12);
      else if (event.key === "-") camera.position.sub(controls.target).multiplyScalar(1.12).add(controls.target);
      else if (event.key.startsWith("Arrow")) { const offset = camera.position.clone().sub(controls.target); const spherical = new THREE.Spherical().setFromVector3(offset); if (event.key === "ArrowLeft") spherical.theta -= 0.15; if (event.key === "ArrowRight") spherical.theta += 0.15; if (event.key === "ArrowUp") spherical.phi -= 0.12; if (event.key === "ArrowDown") spherical.phi += 0.12; spherical.makeSafe(); camera.position.setFromSpherical(spherical).add(controls.target); }
      controls.update(); needsRender = true; schedule();
    };
    let lastAspect = 0;
    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight; if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height;
      if (!lastAspect || Math.abs(camera.aspect - lastAspect) > 0.08) {
        const fittedDistance = cameraDistance * Math.max(1, 1.62 / camera.aspect);
        camera.position.sub(controls.target).normalize().multiplyScalar(fittedDistance).add(controls.target); controls.maxDistance = fittedDistance * 2.3; controls.update(); controls.saveState(); lastAspect = camera.aspect;
      }
      camera.updateProjectionMatrix(); needsRender = true; schedule();
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize(); highlight();
    const markDirty = () => { needsRender = true; schedule(); }; controls.addEventListener("change", markDirty);
    function animate() {
      frame = 0;
      if (disposed || document.hidden) return;
      controls.update();
      let lifting=false;
      for(const mesh of meshes.values()){const delta=mesh.userData.targetY-mesh.position.y;if(Math.abs(delta)>.002){mesh.position.y+=latest.current.paused?delta:delta*.24;lifting=true;needsRender=true;}}
      if (needsRender) { renderer.render(scene,camera); positionLabels(); needsRender=false; }
      if(lifting)schedule();

    }
    schedule();
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { needsRender = true; schedule(); } };
    document.addEventListener("visibilitychange", visibility);
    const lost = (event: Event) => { event.preventDefault(); setError("The 3D graphics context was interrupted. Switched to the equivalent 2D map."); setMode("2d"); };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.domElement.addEventListener("pointerdown", onDown); renderer.domElement.addEventListener("pointermove", onMove); renderer.domElement.addEventListener("pointerup", onUp); renderer.domElement.addEventListener("pointercancel", onUp); renderer.domElement.addEventListener("keydown", onKey);
    controller.current = { reset: () => { controls.reset(); needsRender = true; schedule(); }, zoom: amount => { camera.position.sub(controls.target).multiplyScalar(amount).add(controls.target); controls.update(); needsRender = true; schedule(); }, highlight };
    return () => {
      disposed = true; cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); controls.dispose(); controller.current = null;
      renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointermove", onMove); renderer.domElement.removeEventListener("pointerup", onUp); renderer.domElement.removeEventListener("pointercancel", onUp); renderer.domElement.removeEventListener("keydown", onKey);
      scene.traverse(obj => { if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite || obj instanceof THREE.LineSegments) { if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; materials.forEach(material => material.dispose()); } });
      labelLayer.remove(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [data, mode]);

  const flat = new Map(data.points.map(p => [p.wallet.address, p]));
  const extent = Math.max(data.bound, 12), flatScale = 720 / (extent * 2.2);
  const px = (x: number) => 400 + x * flatScale, py = (z: number) => 245 + z * flatScale;
  return <div ref={viewport} className="universe-viewport">
    <div className="universe-topline"><span><i /> {sceneWallets.length < wallets.length ? `${sceneWallets.length} of ${wallets.length} wallets rendered` : `${wallets.length} wallets in scope`}</span><div className="universe-mode" aria-label="Map display"><button className={mode === "3d" ? "is-active" : ""} onClick={() => { setError(""); setMode("3d"); }} aria-pressed={mode === "3d"}><Box size={13} />3D</button><button className={mode === "2d" ? "is-active" : ""} onClick={() => setMode("2d")} aria-pressed={mode === "2d"}>2D map</button></div></div>
    {sceneWallets.length < wallets.length && <div className="universe-render-limit" role="status">Use filters or the complete wallet table to inspect others. Selecting a wallet brings it into the map. Only connections between rendered wallets are shown.</div>}
    {mode === "3d" ? <div ref={mount} className="universe-render" /> : <svg className="universe-flat" viewBox="0 0 800 500" role="group" aria-label="Accessible 2D wallet map; select a wallet or relationship for evidence">
      <g transform={`translate(400 250) scale(${flatZoom}) translate(-400 -250)`}>
      {data.groups.map(group => { const members = group.wallets.map(id => flat.get(id)!); const x = members.reduce((s,p) => s+p.x,0)/members.length, z = members.reduce((s,p) => s+p.z,0)/members.length, r = Math.max(...members.map(p => Math.hypot(p.x-x,p.z-z))) + 1.2; return <circle key={group.id} cx={px(x)} cy={py(z)} r={r*flatScale} fill="#1e211a" fillOpacity=".35" stroke="#8f7844" strokeWidth="1" strokeDasharray="5 5" tabIndex={0} role="button" aria-label={`Inspect linked group of ${members.length} wallets`} onClick={() => onSelect({kind:"group",...group})} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect({kind:"group",...group});}}}/>; })}
      {data.links.map(link => { const a = flat.get(link.from)!, b = flat.get(link.to)!; const d = `M${px(a.x)} ${py(a.z)} Q${(px(a.x)+px(b.x))/2} ${(py(a.z)+py(b.z))/2-35} ${px(b.x)} ${py(b.z)}`; const select = () => onSelect({kind:"relationship",id:link.id,wallets:[link.from,link.to],evidenceIds:link.evidenceIds}); return <g key={link.id} role="button" tabIndex={0} aria-label={`${link.kind} relationship: ${trim(link.from)} to ${trim(link.to)}`} onClick={select} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select();}}}><path d={d} stroke="transparent" strokeWidth="16" fill="none"/><path d={d} stroke={selected===link.id?"#f4d58b":"#568b80"} strokeWidth={selected===link.id?3:1.5} fill="none"/></g>; })}
      {data.points.map(p => {const active=selected===p.wallet.address||activeWallet===p.wallet.address; const select=()=>onSelect({kind:"wallet",id:p.wallet.address});return <g key={p.wallet.address} role="button" tabIndex={0} aria-label={`${p.wallet.label||p.wallet.address}, ${share(p.wallet.share)}, ${p.wallet.categories.join(", ")}`} onClick={select} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select();}}}><rect x={px(p.x)-Math.max(5,p.r*flatScale)-4} y={py(p.z)-Math.max(5,p.r*flatScale)*.7-4} width={Math.max(5,p.r*flatScale)*2+8} height={Math.max(5,p.r*flatScale)*1.4+8} rx={3} fill="transparent" stroke={active?"#e5e9c9":"transparent"} strokeWidth="2"/><rect x={px(p.x)-Math.max(5,p.r*flatScale)} y={py(p.z)-Math.max(5,p.r*flatScale)*.7} width={Math.max(5,p.r*flatScale)*2} height={Math.max(5,p.r*flatScale)*1.4} rx={2} fill={p.wallet.share == null ? "none" : p.color} fillOpacity=".8" stroke={p.color} strokeDasharray={p.wallet.share == null ? "3 3" : undefined}/><text x={px(p.x)} y={py(p.z)+p.r*flatScale+18} textAnchor="middle" fill="#cbdad5" fontSize="11">{p.wallet.label||trim(p.wallet.address)}</text></g>;})}
      </g>
    </svg>}
    {!wallets.length && <div className="universe-no-data"><Box size={32}/><strong>No wallets in this view</strong><span>Change the filters or scan a token to inspect reported wallets.</span></div>}
    {error && <div role="status" className="universe-error">{error}</div>}
    <div className="universe-bottomline"><span className="universe-hint">{hover || (mode === "3d" ? "Drag to orbit · Scroll to zoom · Shift-drag a wallet" : "Select a wallet block or connection to inspect its evidence")}</span><div className="universe-camera"><button onClick={()=>mode==="3d"?controller.current?.zoom(.85):setFlatZoom(z=>Math.min(3,z*1.2))} aria-label="Zoom in"><Plus size={16}/></button><button onClick={()=>mode==="3d"?controller.current?.zoom(1.18):setFlatZoom(z=>Math.max(.5,z/1.2))} aria-label="Zoom out"><Minus size={16}/></button><button onClick={()=>{controller.current?.reset();setFlatZoom(1);}} aria-label="Reset map view"><RotateCcw size={15}/></button><button onClick={()=>{const el=viewport.current;if(el&&!document.fullscreenElement)void el.requestFullscreen().catch(()=>setError("Fullscreen is unavailable in this browser."));else if(document.fullscreenElement)void document.exitFullscreen();}} aria-label="Toggle map fullscreen"><Expand size={15}/></button></div></div>
    <div className="universe-scale"><Move size={12}/> Block footprint = current supply share, with a minimum visible size. Unknown balances are dark blocks. Position does not establish ownership.</div>
  </div>;
}
