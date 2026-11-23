// Picnic owns its choreography and props. Actors and character pose geometry remain shared.
const picnicEase = v => { const t=Math.max(0,Math.min(1,v)); return t*t*(3-2*t); };
function picnicPath(ctx, d, fill, ink='#68422e', width=2.4) {
  const path=new Path2D(d);ctx.lineJoin=ctx.lineCap='round';
  if(fill){ctx.fillStyle=fill;ctx.fill(path)}
  if(ink){ctx.strokeStyle=ink;ctx.lineWidth=width;ctx.stroke(path)}
  return path;
}
function drawBasket(ctx,x,y,rotation=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);
  picnicPath(ctx,'M-12-17C-15-39 13-40 12-17',null,'#68422e',4);
  picnicPath(ctx,'M-12-17C-15-39 13-40 12-17',null,'#e6bb7d',1.6);
  picnicPath(ctx,'M-23-19Q-21-4-17 0Q1 5 18-1L23-19Z','#e6bb7d');
  picnicPath(ctx,'M14-18L12 1L18-1L23-19Z','#c58c55',null);
  for(const y of [-12,-5])picnicPath(ctx,`M-19 ${y}Q0 ${y+3}19 ${y-1}`,null,'#ae7748',1.6);
  for(const x of [-10,1,11])picnicPath(ctx,`M ${x} -17 L ${x-1} 1`,null,'#ae7748',1.4);
  picnicPath(ctx,'M-24-21Q-3-25 24-21L22-16Q1-12-23-17Z','#f2d29a');
  ctx.restore();
}
// A single material surface: laid fabric and its curl share the same vertices.
function blanketPoint(width,depth,spread,u,v) {
  const remaining=width*(1-spread),radius=Math.sqrt(remaining*.25);
  const curled=u>spread && remaining>0;
  const angle=curled?(u-spread)/(1-spread)*Math.PI*2:0;
  const along=curled?width*spread+radius*Math.sin(angle):width*u;
  return [-width/2+width*.1*(1-v)+along*(.8+.2*v),
    -depth*.65+depth*v+Math.sin(u*Math.PI)*3*v-radius*(1-Math.cos(angle))];
}
function drawBlanket(ctx,width,depth,spread=1) {
  const point=(u,v)=>blanketPoint(width,depth,spread,u,v);
  // Subdivide the material, not the animation: checker cells follow the curl as it unwinds.
  for(let row=0;row<5;row++)for(let col=8;col>=0;col--){
    const points=[];
    for(let i=0;i<=24;i++)points.push(point((col+i/24)/9,row/5));
    for(let i=24;i>=0;i--)points.push(point((col+i/24)/9,(row+1)/5));
    picnicPath(ctx,'M'+points.map(p=>p.join(' ')).join(' L')+' Z',(row+col)%2?'#fff9eb':'#cf5361',null);
  }
  for(const v of [0,1]){
    const points=Array.from({length:217},(_,i)=>point(i/216,v));
    picnicPath(ctx,'M'+points.map(p=>p.join(' ')).join(' L'),null,'#a94d60',2.4);
  }
  for(const u of [0,1])picnicPath(ctx,`M${point(u,0)}L${point(u,1)}`,null,'#a94d60',2.4);
}
class PicnicScene {
  constructor(guest) {
    this.phase=guest.visible?'fetch':'arrive';this.elapsed=0;this.sit=0;this.spread=0;
    this.basketDown=0;this.exiting=false;this.done=false;
  }
  draw(ctx,at,owner,guest,reduced=false) {
    const settled=at.settled!==false;
    if(!settled && !this.anchor)return null;
    if(settled)this.anchor={x:at.x,ground:at.ground};
    else at={...at,...this.anchor,dt:0};
    const c=guest.character,dt=at.dt;
    const gap=(owner.seated.width+c.seated.width)*.29;
    const center=at.x-gap/2,width=(owner.seated.width+c.seated.width)*.65+100;
    const depth=Math.max(owner.seated.height,c.seated.height)*.65;
    const seat=at.x-gap, placement=center-width/2-c.width*.42;
    const destination=this.phase==='arrive'?placement:seat;
    guest.y??=at.ground;guest.y+=(at.ground-guest.y)*Math.min(1,dt*10);
    const advance=phase=>{this.phase=phase;this.elapsed=0;};
    if(this.exiting && !['rise','retrieve','pack','lift','depart','return'].includes(this.phase))advance('rise');
    this.elapsed+=dt;
    let walking=false,face=1;
    if(['fetch','arrive','approach','retrieve','depart','return'].includes(this.phase)) {
      const target=this.phase==='retrieve'?placement:['arrive','approach','return'].includes(this.phase)?destination:-c.width-65;
      const distance=target-guest.x;face=Math.sign(distance)||1;walking=Math.abs(distance)>1;
      guest.phase=(guest.phase+dt*c.gait.hz)%1;
      guest.x+=Math.sign(distance)*Math.min(Math.abs(distance),210*c.gait.pace(guest.phase)*dt);
      if(!walking){
        if(this.phase==='fetch')advance('arrive');
        else if(this.phase==='arrive')advance('place');
        else if(this.phase==='approach')advance('sit');
        else if(this.phase==='retrieve')advance('pack');
        else if(this.phase==='depart' && this.returning)advance('return');
        else this.done=true;
      }
    } else if(this.phase==='place') {
      this.basketDown=picnicEase(this.elapsed/.8);
      if(this.elapsed>=.8)advance('unroll');
    } else if(this.phase==='unroll') {
      this.spread=picnicEase(this.elapsed/.55);
      if(this.elapsed>=.55)advance('approach');
    } else if(this.phase==='sit') {
      this.sit=picnicEase(this.elapsed/1.1);
      if(this.elapsed>=1.1)advance('rest');
    } else if(this.phase==='rise') {
      this.sit=Math.max(0,this.sit-dt/1.1);
      if(this.sit===0)advance('retrieve');
    } else if(this.phase==='pack') {
      this.spread=Math.max(0,this.spread-dt/.55);
      if(this.spread===0)advance('lift');
    } else if(this.phase==='lift') {
      this.basketDown=Math.max(0,this.basketDown-dt/.8);
      if(this.basketDown===0)advance('depart');
    }
    const carrying=['arrive','place','lift','depart'].includes(this.phase);
    const rollX=carrying?guest.x+c.width*.42:center-width/2;
    const rollY=at.ground-8-(carrying?22*(1-this.basketDown):0);
    if(this.phase!=='fetch' && this.phase!=='return'){
      ctx.save();ctx.translate(rollX+width/2,rollY);drawBlanket(ctx,width,depth,this.spread);ctx.restore();
    }
    this.cuddle=Math.max(0,Math.min(1,(this.cuddle||0)+(this.phase==='rest'?1:-1)*dt/1.2));
    const cuddle=reduced?Number(this.phase==='rest'):picnicEase(this.cuddle);
    const motion={state:walking?'walk':this.phase==='rest'?'cuddle':'sit',sit:this.sit,cuddle,phase:guest.phase,t:this.elapsed,stretch:1,hop:0,crouch:0,impact:0,airborne:false};
    const height=c.height+(c.seated.height-c.height)*this.sit;
    guest.poseHeight=height;guest.ready=this.phase==='rest';guest.visible=true;
    c.draw(ctx,{...at,x:guest.x,ground:guest.y,face,rot:.04*cuddle,accel:[0,0]},motion);
    const hit=settled && owner.draw(ctx,{...at,face:1,rot:-.12*cuddle,accel:[0,0]},
      {...motion,phase:0,state:this.phase==='rest'?'cuddle':'sit'});
    if(!['fetch','return'].includes(this.phase)) {
      const bob=walking&&!reduced?Math.sin(guest.phase*Math.PI*2)*1.5:0;
      const carryX=guest.x+c.width*.12;
      const basketX=carrying?carryX:placement+c.width*.12;
      const basketY=at.ground-(carrying?12*(1-this.basketDown):0)+bob*(1-this.basketDown);
      drawBasket(ctx,basketX,basketY,walking?Math.sin(guest.phase*Math.PI*2)*.06:0);
    }
    if(this.phase==='rest'&&!reduced)drawHeartEffect(ctx,{x:center,y:at.ground-Math.max(owner.seated.height,c.seated.height)-10,toX:null,colors:HEART_COLORS,t:this.elapsed%3.6,sway:0,dir:1});
    return hit;
  }
}
// Static previews use the same scene, at its resting phase.
function drawPicnic(ctx,left,right,t,reduced=false) {
  const scene=new PicnicScene({visible:false});Object.assign(scene,{phase:'rest',elapsed:t,sit:1,spread:1,basketDown:1,cuddle:1});
  const gap=(left.seated.width+right.seated.width)*.29;
  const guest={character:right,x:-gap/2,y:0,phase:0};
  const hit=scene.draw(ctx,{x:gap/2,ground:0,dt:0,now:t*1000},left,guest,reduced);
  return {hit,leftX:gap/2,rightX:-gap/2};
}
