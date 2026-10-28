/*
 * Pièce de pricoupenkoin en 3D (paquet pricoup-medal, Three.js 0.180.0).
 * Adaptée au portail : textures servies depuis public/medaille/ et
 * libellés en français, sans texte de chargement. Rotation limitée à l'axe vertical.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMedal } from './medal-model.js';

const defaultAssets = '/medaille/';
const style = `
 :host { display:block; position:relative; width:100%; height:100%; min-height:180px; contain:layout paint; }
 canvas { display:block; width:100%; height:100%; touch-action:pan-y; cursor:grab; outline:none; }
 canvas:active { cursor:grabbing; } canvas:focus-visible { outline:2px solid #a17b3d; outline-offset:-5px; border-radius:8px; }
 .message { position:absolute; inset:0; display:grid; place-content:center; font:14px/1.6 system-ui; text-align:center; color:inherit; padding:25px; pointer-events:none; }
 .message[hidden] {display:none;} img {max-width:100%;max-height:100%;object-fit:contain;}
`;

/** Framework-independent, transparent WebGL medal. Public methods: reset(), flip(), exportGLB(). */
export class PricoupMedal extends HTMLElement {
  static observedAttributes=['auto-rotate','rotation-speed','relief','lighting','zoom','interactive'];
  constructor() {
    super(); this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML=`<style>${style}</style><div class="message" role="status"></div>`;
    this._message=this.shadowRoot.querySelector('.message');
    this._yaw=-.13; this._velocity=0; this._raf=0;
    this._reduced=matchMedia('(prefers-reduced-motion: reduce)');
  }
  connectedCallback() { if(!this._abort) this._init(); }
  disconnectedCallback() {
    this._abort?.abort(); this._abort=null;
    cancelAnimationFrame(this._raf); this._observer?.disconnect();
    this._renderer?.dispose(); this._renderer?.forceContextLoss(); this._renderer?.domElement.remove();
    this._model?.medal.traverse(o=>o.geometry?.dispose());
    this._model?.materials.forEach(m=>m.dispose()); this._model?.textures.forEach(t=>t.dispose());
    this._env?.dispose(); this._model=null; this._renderer=null; this._lastRelief=undefined;
  }
  attributeChangedCallback() { this._apply(); }
  _number(name,fallback,min,max) {
    const raw=this.getAttribute(name); const n=raw===null?fallback:Number(raw);
    return Number.isFinite(n)?THREE.MathUtils.clamp(n,min,max):fallback;
  }
  async _init() {
    const abort=this._abort=new AbortController(); const {signal}=abort;
    try {
      this._message.hidden=false; this._message.textContent='';
      this._renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
      const renderer=this._renderer;
      renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setClearColor(0x000000,0);
      renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.06;
      const canvas=renderer.domElement;
      canvas.tabIndex=0; canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label',this.getAttribute('aria-label')||'Pièce de pricoupenkoin en 3D. Faites-la tourner en glissant horizontalement ou avec les flèches gauche et droite.');
      this.shadowRoot.append(canvas);
      this._scene=new THREE.Scene();
      this._camera=new THREE.PerspectiveCamera(34,1,.1,30); this._camera.position.z=3.9;
      const room=new RoomEnvironment(); const pmrem=new THREE.PMREMGenerator(renderer);
      this._env=pmrem.fromScene(room,.06); this._scene.environment=this._env.texture; room.dispose(); pmrem.dispose();
      this._lights=new THREE.Group(); this._scene.add(this._lights);
      const key=new THREE.DirectionalLight(0xfff3da,3.3); key.position.set(-3,4,5); this._lights.add(key);
      const fill=new THREE.DirectionalLight(0xc5dfff,1.5); fill.position.set(4,0,3); this._lights.add(fill);
      const rim=new THREE.DirectionalLight(0xffe2a4,3.6); rim.position.set(-2,1,-4); this._lights.add(rim);
      this._scene.add(new THREE.HemisphereLight(0xffffff,0x8f9aa5,.75));
      const assets=new URL(this.getAttribute('asset-base')??defaultAssets,document.baseURI);
      // Asset-base must end with / to denote a directory.
      const model=await createMedal(assets,{signal});
      if(signal.aborted) { model.medal.traverse(o=>o.geometry?.dispose()); model.materials.forEach(m=>m.dispose()); model.textures.forEach(t=>t.dispose()); return; }
      this._model=model; this._scene.add(model.medal);
      this._observer=new ResizeObserver(()=>this._resize()); this._observer.observe(this); this._resize();
      this._bind(canvas,signal); this._apply(); this._message.hidden=true;
      this.dispatchEvent(new CustomEvent('medal-ready',{bubbles:true,composed:true}));
      let last=performance.now(), lastYaw=NaN;
      const frame=(now)=>{
        if(signal.aborted) return;
        const dt=Math.min((now-last)/1000,.05); last=now;
        if(!this._dragging) {
          this._yaw+=this._velocity*dt; this._velocity*=Math.exp(-5*dt);
          if(Math.abs(this._velocity)<.001) this._velocity=0;
          if(this.hasAttribute('auto-rotate')&&!this._reduced.matches) this._yaw+=dt*this._number('rotation-speed',.32,-3,3);
        }
        model.medal.rotation.set(0,this._yaw,0);
        if(this._visible!==false&&(this._dirty||lastYaw!==this._yaw)) {
          renderer.render(this._scene,this._camera); this._dirty=false;
          lastYaw=this._yaw;
        }
        this._raf=requestAnimationFrame(frame);
      };
      this._raf=requestAnimationFrame(frame);
      const visible=new IntersectionObserver(([entry])=>{this._visible=entry.isIntersecting;}); visible.observe(this);
      signal.addEventListener('abort',()=>visible.disconnect(),{once:true});
    } catch(error) {
      if(signal.aborted) return;
      this._message.hidden=false; this._message.textContent='';
      this.dispatchEvent(new CustomEvent('medal-error',{detail:error,bubbles:true,composed:true}));
      console.error('PricoupMedal:',error);
    }
  }
  _resize() {
    if(!this._renderer) return;
    const {width,height}=this.getBoundingClientRect(); if(!width||!height) return;
    this._renderer.setSize(width,height,false); this._camera.aspect=width/height;
    this._camera.updateProjectionMatrix(); this._apply();
  }
  _apply() {
    if(!this._model) return;
    this._dirty=true;
    const scale=this._number('relief',1,0,3);
    const g=this._model.front.geometry, p=g.attributes.position, depths=g.userData.depths;
    if(this._lastRelief!==scale) {
      for(let i=0;i<p.count;i++) p.setZ(i,.062+depths[i]*scale);
      p.needsUpdate=true; g.computeVertexNormals(); this._lastRelief=scale;
    }
    const presets={studio:[1.06,0],warm:[1.15,.7],dramatic:[.78,-.7]};
    const [exposure,angle]=presets[this.getAttribute('lighting')]||presets.studio;
    this._renderer.toneMappingExposure=exposure; this._lights.rotation.y=angle;
    const aspect=this._camera.aspect;
    this._camera.position.z=3.9/Math.min(1,aspect)/this._number('zoom',1,.65,1.45);
  }
  _bind(canvas,signal) {
    let x=0,t=0;
    const enabled=()=>this.getAttribute('interactive')!=='false';
    canvas.addEventListener('pointerdown',e=>{
      if(!enabled()||e.button!==0) return;
      this._dragging=true; this._velocity=0; x=e.clientX;t=e.timeStamp;
      canvas.setPointerCapture(e.pointerId); canvas.focus({preventScroll:true});
      this.dispatchEvent(new CustomEvent('medal-interact',{bubbles:true,composed:true}));
    },{signal});
    canvas.addEventListener('pointermove',e=>{
      if(!this._dragging) return;
      const dx=e.clientX-x,dt=Math.max(8,e.timeStamp-t);
      this._yaw+=dx*.009;
      this._velocity=THREE.MathUtils.clamp(dx*.009/dt*1000,-5,5);
      x=e.clientX;t=e.timeStamp;
    },{signal});
    const end=()=>{this._dragging=false;};
    canvas.addEventListener('pointerup',end,{signal}); canvas.addEventListener('pointercancel',()=>{end();this._velocity=0;},{signal});
    canvas.addEventListener('lostpointercapture',end,{signal});
    canvas.addEventListener('keydown',e=>{
      if(!enabled()) return;
      const actions={ArrowLeft:()=>{this._yaw-=.15;},ArrowRight:()=>{this._yaw+=.15;},Home:()=>this.reset(),'+':()=>this._zoom(.1),'=':()=>this._zoom(.1),'-':()=>this._zoom(-.1)};
      if(actions[e.key]) {e.preventDefault();actions[e.key]();this.dispatchEvent(new CustomEvent('medal-interact',{bubbles:true,composed:true}));}
    },{signal});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this._message.hidden=false;this._message.textContent='';},{signal});
  }
  _zoom(delta) {this.setAttribute('zoom',this._number('zoom',1,.65,1.45)+delta);}
  reset() {this._yaw=-.13;this._velocity=0;this.setAttribute('zoom','1');}
  flip() {this._yaw+=Math.PI;this._velocity=0;}
  async exportGLB() {
    if(!this._model) throw new Error('Wait for medal-ready before exporting.');
    const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
    const clone=this._model.medal.clone(); clone.rotation.set(0,0,0);
    return new GLTFExporter().parseAsync(clone,{binary:true,onlyVisible:true});
  }
}
if(!customElements.get('pricoup-medal')) customElements.define('pricoup-medal',PricoupMedal);
