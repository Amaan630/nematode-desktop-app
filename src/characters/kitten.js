// Orange tabby: four staggered paws, a closed tail, and hats fitted to the head.
function drawKitten(c, x, y, z=1, phase=0, moving=false, hat='none', face=1, seated=false, cuddle=0) {
 const ink='#68422e',orange='#ffc45d',shadow='#eaa042',cream='#fff0ce',stripe='#e78b32';
 const hit = new Path2D(), base = c.getTransform();
 c.save();c.translate(x,y);c.scale(z*face,z);c.lineJoin=c.lineCap='round';
 const path=(d,fill,stroke=ink,w=1.8)=>{const p=new Path2D(d);if(fill){c.fillStyle=fill;c.fill(p);if(fill===orange||fill===shadow)hit.addPath(p,base.inverse().multiply(c.getTransform()))}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke(p)}};
 const bob=moving?Math.cos(phase*2)*.45:0;
 const foot=(hip,offset,far=false)=>{
   const u=((phase/(Math.PI*2)+offset)%1+1)%1;
   let dx=0,lift=0;
   if(moving){if(u<.7)dx=5-10*u/.7;else{const v=(u-.7)/.3;dx=-5+10*(v-Math.sin(2*Math.PI*v)/(2*Math.PI));lift=4.5*Math.sin(Math.PI*v)**2}}
   return {x:hip+dx,y:(far?-6:0)-lift};
 };
 if (seated) {
path('M-24-6C-34-14-30-30-16-41Q-2-52 15-36Q29-19 23-7Q12 3-24-6Z',orange);
path('M-26-20Q-19-7 6-9Q20-9 24-17Q28-2 4-2Q-25 0-26-20Z',shadow,null);
path('M-24-31L-15-25L-16-36ZM-29-22L-20-18L-23-28Z',stripe,null);
path('M-10-22Q-12-10-9-5Q-5 0 1-4L2-22M8-22L8-6Q11-1 18-4Q20-9 18-20',orange);
path('M-25-9Q-35-5-30 0Q-9 8 17 5Q36 3 47-5',null,ink,9);
path('M-25-9Q-35-5-30 0Q-9 8 17 5Q36 3 47-5',null,orange,5.8);
 } else {
 const h=foot(-29,0),f=foot(16,.25),bh=foot(-11,.5,true),bf=foot(35,.75,true);
 const leg=(hip,p)=>path(`M ${hip-4} ${-25+bob} Q ${hip-5} -15 ${p.x-3} ${p.y-5} Q ${p.x-5} ${p.y} ${p.x-1} ${p.y} L ${p.x+5} ${p.y} Q ${p.x+7} ${p.y-2} ${p.x+3} ${p.y-4} Q ${hip+5} -15 ${hip+4} ${-25+bob} Z`,shadow);
 // The far paws have their own depth and horizontal spacing, so all four read clearly.
 leg(-12,bh);leg(31,bf);
 c.save();c.translate(-34,-29+bob);c.rotate(moving?Math.sin(phase)*.06:0);
 path('M 3 5 C -9 5 -18 -3 -19 -14 C -20 -21 -17 -25 -13 -24 C -9 -23 -11 -19 -12 -17 C -15 -10 -7 -4 3 -4 Z',orange);
 path('M -18 -14 L -12 -13 M -14 -5 L -9 -8',null,stripe,2.8);c.restore();
 // The near legs are part of the body perimeter, with no lines across their roots.
 path(`M -38 ${-25+bob} C -40 ${-40+bob} -24 ${-46+bob} -7 ${-44+bob} C 12 ${-44+bob} 31 ${-38+bob} 31 ${-26+bob}
 Q 29 -18 ${f.x+4} ${f.y-5} Q ${f.x+9} ${f.y-2} ${f.x+6} ${f.y} L ${f.x-2} ${f.y} Q ${f.x-5} ${f.y} ${f.x-4} ${f.y-5} Q 13 -12 12 ${-18+bob}
 Q -1 ${-14+bob} -19 ${-19+bob} Q -22 -12 ${h.x+3} ${h.y-5} Q ${h.x+8} ${h.y-2} ${h.x+5} ${h.y} L ${h.x-3} ${h.y} Q ${h.x-6} ${h.y} ${h.x-5} ${h.y-5} Q -36 -16 -38 ${-25+bob} Z`,orange);
 path(`M -36 ${-27+bob} Q -23 ${-19+bob} -8 ${-21+bob} Q 5 ${-20+bob} 16 ${-25+bob} L 12 ${-18+bob} Q -1 ${-14+bob} -19 ${-19+bob} Q -31 ${-18+bob} -36 ${-27+bob} Z`,shadow,null);
 path(`M -26 ${-42+bob} Q -25 ${-32+bob} -20 ${-29+bob} L -19 ${-44+bob} Z M -10 ${-44+bob} Q -9 ${-34+bob} -4 ${-30+bob} L -3 ${-44+bob} Z M 6 ${-42+bob} Q 5 ${-35+bob} 10 ${-31+bob} L 13 ${-41+bob} Z`,stripe,null);
 }
 c.save();c.translate(seated?10:29,seated?-43:-39+bob);c.scale(.9,.9);c.rotate(seated?cuddle*.12:moving?Math.sin(phase)*.018:0);
 path('M-23-12L-24-37Q-24-41-20-38L-7-27Q3-29 10-26L23-37Q26-39 26-34L25-10Q32 1 23 11Q12 20-4 17Q-24 17-28 5Q-31-4-23-12Z',orange);
 path('M-20-30L-19-17L-11-24Z','#efb4a0',null);path('M21-30L13-23L22-17Z','#efb4a0',null);
 path('M23-13Q31 1 23 11Q12 20-4 17Q-18 17-24 9Q-7 16 13 9Q23 4 23-13Z',shadow,null);
 path('M-10-26L-8-15Q-4-17-5-27ZM-1-28L0-17Q4-16 4-28ZM10-26L7-16Q11-16 14-28ZM-25-12L-19-9L-25-7ZM-27-3L-20 0L-27 2ZM26-12L20-9L26-7ZM28-3L21 0L27 2Z',stripe,null);
 if (seated && cuddle > .4) {
   for (const x of [-13,13]) { c.strokeStyle=ink;c.lineWidth=1.7;c.beginPath();c.arc(x,-6,5.5,.15*Math.PI,.85*Math.PI);c.stroke(); }
 } else for(const xx of [-13,13]){c.fillStyle='#c6d7a5';c.strokeStyle=ink;c.lineWidth=1.6;c.beginPath();c.ellipse(xx,-5,6.5,7.5,0,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#43513b';c.beginPath();c.ellipse(xx+1,-5,2.3,5.2,0,0,Math.PI*2);c.fill()}
 path('M-10 6Q-10 0-2 2Q0 3 2 2Q10 0 11 6Q10 13 1 11Q-7 14-10 6Z',cream,null);
 path('M-3 2Q0 0 3 2L0 5Z','#c58a7d',ink,1);path('M0 5L0 8Q-3 11-6 8M0 8Q3 11 6 8',null,ink,1.2);
 path('M-22 3L-30 1M-22 7L-30 8M23 3L31 1M23 7L31 8',null,ink,1.1);
 if(hat!=='none'){const fit={beret:[-1,-25,1.58,1.05,-.08],cap:[-2,-24,1.48,1.12,0],beanie:[0,-24,1.55,1.15,0],sunhat:[0,-23,1.4,1.05,0]}[hat];c.save();c.translate(fit[0],fit[1]);c.rotate(fit[4]);c.scale(fit[2],fit[3]);hit.addPath(drawHat(c,hat),base.inverse().multiply(c.getTransform()));c.restore()}
 c.restore();c.restore();
 return hit;
}

if (typeof CHARACTERS !== 'undefined') CHARACTERS.kitten = {
  name: 'Kitten', width: 110, height: 76, seated: {width:80,height:80}, dust: '#eaa042',
  gait: { hz: 2.8, pace: () => (10 / .7 * 2.8) / 210 },
  draw(ctx, at, m) {
    const base = ctx.getTransform(), zoom = at.zoom ?? 1;
    ctx.save(); ctx.translate(at.x, at.ground - m.hop); ctx.rotate(at.rot || 0);
    const squash = Math.max(.65, m.stretch * (1 - .15 * m.crouch - .12 * m.impact));
    ctx.scale(zoom / Math.sqrt(squash), zoom * squash);
    const hit = drawKitten(ctx, 0, 0, 1, m.phase * Math.PI * 2, m.state === 'walk',
      at.appearance?.accessories?.hat || at.hat || 'none', at.face, ['sit','cuddle'].includes(m.state), m.cuddle || 0);
    const outline = new Path2D();
    outline.addPath(hit, base.inverse().multiply(ctx.getTransform()));
    ctx.restore(); return outline;
  },
};
