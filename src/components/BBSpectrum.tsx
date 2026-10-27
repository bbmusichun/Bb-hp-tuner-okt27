import React, { useEffect, useRef } from 'react';
import { ResonanceMeasurement } from '../types/tuner';
import { bbAudioEngine } from '../audio/audioEngine';

interface Props { alap: ResonanceMeasurement; kvint: ResonanceMeasurement; oktav: ResonanceMeasurement; hasSignal: boolean; onSelectPeak?: (role: 'fundamental' | 'fifth' | 'octave') => void; }
const COLORS = { fundamental: '#fbbf24', octave: '#22d3ee', fifth: '#c084fc' };
const NOTES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function noteName(hz:number) { if (!Number.isFinite(hz)||hz<=0) return '--'; const m=Math.round(69+12*Math.log2(hz/440)); return NOTES[((m%12)+12)%12]+(Math.floor(m/12)-1); }

export const BBSpectrum: React.FC<Props> = ({ alap, kvint, oktav, hasSignal, onSelectPeak }) => {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const latest=useRef({alap,kvint,oktav,hasSignal}); latest.current={alap,kvint,oktav,hasSignal};
  useEffect(()=>{
    const canvas=canvasRef.current, ctx=canvas?.getContext('2d'); if(!canvas||!ctx)return;
    let raf=0;
    const draw=()=>{
      const s=latest.current,w=canvas.width,h=canvas.height,L=54,R=16,T=84,B=36,pw=w-L-R,ph=h-T-B;
      const rawBase=s.alap.targetHz??146.83, base=Number.isFinite(rawBase)&&rawBase>0?rawBase:146.83, low=Math.max(40,base/1.122), high=Math.max(base*1.78,low+60), minDb=-100,maxDb=-20;
      const X=(hz:number)=>L+(hz-low)/(high-low)*pw, Y=(db:number)=>T+(maxDb-Math.max(minDb,Math.min(maxDb,db)))/(maxDb-minDb)*ph;
      ctx.clearRect(0,0,w,h); const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#0a101b');bg.addColorStop(1,'#070b12');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle='#0b1421';ctx.fillRect(L,T,pw,ph);
      ctx.font='12px system-ui';ctx.textAlign='right';ctx.textBaseline='middle';
      [-20,-40,-60,-80,-100].forEach(db=>{const y=Y(db);ctx.strokeStyle='#253348';ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillStyle='#8192aa';ctx.fillText(String(db),L-9,y);});
      ctx.fillStyle='#8192aa';ctx.textAlign='left';ctx.fillText('dB',12,T-12);
      const step=high-low>850?100:50;ctx.textAlign='center';ctx.textBaseline='top';
      for(let hz=Math.ceil(low/step)*step;hz<=high;hz+=step){const x=X(hz);ctx.strokeStyle='#1b2a3d';ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,T+ph);ctx.stroke();ctx.fillStyle='#91a4bf';ctx.fillText(String(hz),x,T+ph+7);}
      ctx.fillStyle='#91a4bf';ctx.font='13px system-ui';ctx.fillText('Frekvencia (Hz)',L+pw/2,h-18);
      const data=bbAudioEngine.getFloatFrequencyData(), sr=bbAudioEngine.getSampleRate(), binW=sr/(data.length*2), pts:Array<{x:number;y:number}>=[];
      for(let i=1;i<data.length;i++){const hz=i*binW;if(hz>=low&&hz<=high)pts.push({x:X(hz),y:Y(Number.isFinite(data[i])?data[i]:minDb)});}
      if(pts.length){ctx.beginPath();ctx.moveTo(pts[0].x,T+ph);pts.forEach(p=>ctx.lineTo(p.x,p.y));ctx.lineTo(pts[pts.length-1].x,T+ph);ctx.closePath();const g=ctx.createLinearGradient(0,T,0,T+ph);g.addColorStop(0,'rgba(56,189,248,.17)');g.addColorStop(1,'rgba(56,189,248,.005)');ctx.fillStyle=g;ctx.fill();ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#3baed4';ctx.lineWidth=1.6;ctx.stroke();}
      const peaks=[
        {role:'fundamental' as const,label:'1× Alaphang',m:s.alap,fallback:base,color:COLORS.fundamental},
        {role:'octave' as const,label:'2× Oktáv',m:s.oktav,fallback:base*2,color:COLORS.octave},
        {role:'fifth' as const,label:'3× Parciális',m:s.kvint,fallback:base*3,color:COLORS.fifth}
      ];
      peaks.forEach((p,i)=>{const rawTarget=p.m.targetHz ?? p.fallback, target=Number.isFinite(rawTarget)&&rawTarget>0?rawTarget:p.fallback, rawMeasured=p.m.measuredHz, hz=rawMeasured!==null&&Number.isFinite(rawMeasured)&&(p.m.status==='valid'||p.m.status==='held')?rawMeasured:target;if(hz<low||hz>high)return;const x=X(hz),bin=Math.max(0,Math.min(data.length-1,Math.round(hz/binW))),db=s.hasSignal&&Number.isFinite(data[bin])?data[bin]:-75,y=Y(db);
        ctx.save();ctx.setLineDash([6,5]);ctx.strokeStyle=p.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,T-3);ctx.lineTo(x,y);ctx.stroke();ctx.restore();
        const cw=118,ch=64,cx=Math.max(4,Math.min(w-cw-4,x-cw/2)),cy=7+(i===1?5:0);ctx.fillStyle='#0a1320';ctx.strokeStyle=p.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(cx,cy,cw,ch,12);ctx.fill();ctx.stroke();
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=p.color;ctx.font='bold 17px system-ui';ctx.fillText(p.m.noteName||noteName(target),cx+cw/2,cy+17);ctx.fillStyle='#f8fafc';ctx.font='bold 15px ui-monospace';ctx.fillText(s.hasSignal&&p.m.measuredHz!==null?p.m.measuredHz.toFixed(2)+' Hz':target.toFixed(2)+' Hz',cx+cw/2,cy+37);const c=p.m.deviationCents;ctx.fillStyle=c===null?'#94a3b8':Math.abs(c)<=3?'#34d399':'#fbbf24';ctx.font='bold 14px ui-monospace';ctx.fillText(c===null?'— cent':(c>0?'+':'')+c.toFixed(1)+' c',cx+cw/2,cy+54);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();
      });
      raf=requestAnimationFrame(draw);
    };raf=requestAnimationFrame(draw);return()=>cancelAnimationFrame(raf);
  },[]);
  return <div className="my-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#080e18] shadow-lg"><div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1"><div><h3 className="text-sm font-bold text-white">Frekvenciaspektrum · csúcsértékek</h3><p className="text-[11px] text-slate-400">Nagyított nézet · alaphang, oktáv és 3× parciális</p></div><span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{hasSignal?'Élő mérés':'Várakozás'}</span></div><canvas ref={canvasRef} width={760} height={300} className="block h-[270px] sm:h-[300px] w-full cursor-pointer" onClick={e=>{if(!onSelectPeak)return;const rect=e.currentTarget.getBoundingClientRect(),x=(e.clientX-rect.left)*e.currentTarget.width/rect.width,L=54,pw=e.currentTarget.width-L-16,rawBase=alap.targetHz??146.83,base=Number.isFinite(rawBase)&&rawBase>0?rawBase:146.83,low=Math.max(40,base*.75),high=Math.max(base*1.8,low+60),hz=low+(x-L)/pw*(high-low);const cs=[{role:'fundamental' as const,hz:alap.measuredHz??alap.targetHz??base},{role:'octave' as const,hz:oktav.measuredHz??oktav.targetHz??base*2},{role:'fifth' as const,hz:kvint.measuredHz??kvint.targetHz??base*3}].map(p=>({...p,hz:Number.isFinite(p.hz)&&p.hz>0?p.hz:base}));onSelectPeak(cs.reduce((a,p)=>Math.abs(p.hz-hz)<Math.abs(a.hz-hz)?p:a).role);}}/><div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/5 px-3 py-2 text-[11px] text-slate-400"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400"/>1× Alaphang</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-cyan-400"/>2× Oktáv</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-purple-400"/>3× Parciális</span></div></div>;
};
