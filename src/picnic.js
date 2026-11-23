// Picnic owns its choreography and props. Actors and character pose geometry remain shared.
const picnicEase = v => { const t=Math.max(0,Math.min(1,v)); return t*t*(3-2*t); };
function picnicPath(ctx, d, fill, ink='#68422e', width=2.4) {
  const path=new Path2D(d);ctx.lineJoin=ctx.lineCap='round';
  if(fill){ctx.fillStyle=fill;ctx.fill(path)}
  if(ink){ctx.strokeStyle=ink;ctx.lineWidth=width;ctx.stroke(path)}
  return path;
}
function drawBasket(ctx,x,y,rotation=0,suspended=0) {
  ctx.save();ctx.translate(x,y-33*suspended);ctx.rotate(rotation);ctx.translate(0,33*suspended);
  picnicPath(ctx,'M-12-17C-15-39 13-40 12-17',null,'#68422e',4);
  picnicPath(ctx,'M-12-17C-15-39 13-40 12-17',null,'#e6bb7d',1.6);
  picnicPath(ctx,'M-23-19Q-21-4-17 0Q1 5 18-1L23-19Z','#e6bb7d');
  picnicPath(ctx,'M14-18L12 1L18-1L23-19Z','#c58c55',null);
  for(const y of [-12,-5])picnicPath(ctx,`M-19 ${y}Q0 ${y+3}19 ${y-1}`,null,'#ae7748',1.6);
  for(const x of [-10,1,11])picnicPath(ctx,`M ${x} -17 L ${x-1} 1`,null,'#ae7748',1.4);
  picnicPath(ctx,'M-24-21Q-3-25 24-21L22-16Q1-12-23-17Z','#f2d29a');
  ctx.restore();
  const outline=new Path2D();outline.rect(-25,-38,50,43);
  const hit=new Path2D();hit.addPath(outline,new DOMMatrix().translate(x,y-33*suspended)
    .rotate(rotation*180/Math.PI).translate(0,33*suspended));
  return hit;
}
// A single material surface: laid fabric and its curl share the same vertices.
function blanketPoint(width,depth,spread,u,v,flutter=0,time=0) {
  const remaining=width*(1-spread),radius=Math.sqrt(remaining*.25);
  const curled=u>spread && remaining>0;
  const angle=curled?(u-spread)/(1-spread)*Math.PI*2:0;
  const along=curled?width*spread+radius*Math.sin(angle):width*u;
  return [-width/2+width*.1*(1-v)+along*(.8+.2*v),
    -depth*.65+depth*v+Math.sin(u*Math.PI)*3*v-radius*(1-Math.cos(angle))+flutter*spread*Math.sin(u*Math.PI)*v**4*Math.sin(u*3*Math.PI-time*12)];
}
function drawBlanket(ctx,width,depth,spread=1,flutter=0,time=0) {
  const point=(u,v)=>blanketPoint(width,depth,spread,u,v,flutter,time);
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
// One physical body for the composition; props respond to its motion rather than running timers.
class PicnicBody {
  constructor(x,ground) {
    Object.assign(this,{x,ground,vx:0,vy:0,angle:0,spin:0,basket:0,basketSpin:0,flutter:0,time:0,basketDrop:0,basketFloor:0,
      travel:0,held:false,falling:false,active:false,pivot:{x:0,y:-50}});
  }
  get matrix() {
    const {x,y}=this.pivot;
    return new DOMMatrix().translate(this.x+x,this.ground+y).rotate(this.angle*180/Math.PI)
      .translate(-this.x-x,-this.ground-y);
  }
  grab(point) {
    // Changing the suspension point preserves the current pose, including an airborne re-grab.
    const local=this.matrix.inverse().transformPoint(point);
    this.pivot={x:local.x-this.x,y:local.y-this.ground};
    this.x+=point.x-local.x;this.ground+=point.y-local.y;
    this.active=true;this.held=true;this.falling=false;this.vx=this.vy=this.travel=0;
  }
  move(dx,dy) { this.x+=dx;this.ground+=dy;this.travel+=dx; }
  release({vx=0,vy=0}={}) { this.held=false;this.falling=true;this.vx=vx;this.vy=vy; }
  step(dt,floor,screenWidth,bounds,reduced) {
    if(!this.active||dt<=0)return;
    const speed=this.held?Math.max(-1500,Math.min(1500,this.travel/dt)):this.vx;
    this.travel=0;
    const target=this.held?Math.max(-.24,Math.min(.24,speed*.0005+(-30-this.pivot.x)*.002)):0;
    // Substeps keep the springs and collision response stable across frame rates and pauses.
    const steps=Math.ceil(Math.min(dt,.05)*120),h=Math.min(dt,.05)/steps;
    for(let i=0;i<steps;i++) {
      this.time+=h;
      this.basketDrop+=(this.basketFloor-this.basketDrop)*(1-Math.exp(-12*h));
      this.spin+=((target-this.angle)*90-this.spin*13)*h;this.angle+=this.spin*h;
      this.basketSpin+=((Math.max(-.4,Math.min(.4,speed*.0012))-this.basket)*65-this.basketSpin*7)*h;
      this.basket+=this.basketSpin*h;
      this.flutter=Math.max(this.flutter*Math.exp(-6*h),Math.min(3,Math.abs(speed)*.004+Math.abs(this.spin)));
      if(reduced){this.angle=this.spin=this.basket=this.basketSpin=this.flutter=0;}
      if(this.held)continue;
      if(this.falling){this.vy+=2600*h;this.x+=this.vx*h;this.ground+=this.vy*h;this.vx*=Math.exp(-.7*h);}
      const points=bounds.map(([x,y])=>{
        x-=this.pivot.x;y-=this.pivot.y;
        return [this.pivot.x+x*Math.cos(this.angle)-y*Math.sin(this.angle),
          this.pivot.y+x*Math.sin(this.angle)+y*Math.cos(this.angle)];
      });
      const left=Math.min(...points.map(p=>p[0])),right=Math.max(...points.map(p=>p[0]));
      const top=Math.min(...points.map(p=>p[1])),bottom=Math.max(...points.map(p=>p[1]));
      if(this.x+left<0){this.x=-left;this.vx=Math.abs(this.vx)*.35;}
      if(this.x+right>screenWidth){this.x=screenWidth-right;this.vx=-Math.abs(this.vx)*.35;}
      if(this.ground+top<0){this.ground=-top;this.vy=Math.abs(this.vy)*.35;}
      const landing=floor-bottom;
      if(this.ground>=landing){
        this.ground=landing;
        if(this.vy>180){
          this.flutter=Math.min(4,this.vy/250);this.basketSpin+=Math.min(2,this.vy/700);
          this.spin+=Math.max(-1,Math.min(1,this.vx/500));this.vy*=-.22;this.vx*=.65;
        }else if(this.vy>=0){this.vy=0;this.vx*=Math.exp(-12*h);}
        if(Math.abs(this.vx)<2&&this.vy===0&&Math.abs(this.angle)<.002&&Math.abs(this.spin)<.02){
          this.vx=this.angle=this.spin=0;this.falling=false;this.ground=floor-Math.max(...bounds.map(p=>p[1]));
        }
      }
    }
  }
}
class PicnicScene {
  constructor(guest) {
    this.phase=guest.visible?'fetch':'arrive';this.elapsed=0;this.sit=0;this.spread=0;
    this.basketDown=0;this.exiting=false;this.done=false;
  }
  get placement() { return this.anchor && {x:this.anchor.x,y:this.anchor.ground,then:'idle'}; }
  get dragging() { return Boolean(this.anchor?.held); }
  get moving() { return Boolean(this.anchor && (this.anchor.held||this.anchor.falling)); }
  dragTarget(point) {
    if(!this.anchor)return null;
    this.anchor.grab(point);
    return {move:(dx,dy)=>this.anchor.move(dx,dy),release:velocity=>this.anchor.release(velocity)};
  }
  draw(ctx,at,owner,guest,reduced=false) {
    const settled=at.settled!==false;
    if(!settled && !this.anchor)return null;
    this.anchor??=new PicnicBody(at.x,at.ground);
    this.previous??={x:at.x,ground:at.ground};
    const body=this.anchor,c=guest.character;
    const gap=(owner.seated.width+c.seated.width)*.29;
    const width=(owner.seated.width+c.seated.width)*.65+100,depth=Math.max(owner.seated.height,c.seated.height)*.65;
    const basketCenter=-gap/2-width/2-c.width*.30;
    body.basketFloor=depth*.35-8.5;
    const bounds=[[-gap/2-width/2,depth*.35-5],[-gap/2+width/2,depth*.35-5],
      [basketCenter-25,3.5+body.basketDrop],[basketCenter+25,3.5+body.basketDrop],[basketCenter,-40+body.basketDrop],[0,9],[-gap,9],
      [owner.width/2,-owner.height-20],[-gap-c.width/2,-c.height-20]];
    body.step(settled?at.dt:0,at.floor??at.ground,at.screenWidth??innerWidth,bounds,reduced);
    guest.x+=body.x-this.previous.x;guest.y=(guest.y??at.ground)+body.ground-this.previous.ground;
    this.previous={x:body.x,ground:body.ground};
    at={...at,x:body.x,ground:body.ground,dt:!settled||this.moving?0:at.dt};
    const dt=at.dt,center=at.x-gap/2;
    const matrix=body.matrix;
    ctx.save();ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);
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
      ctx.save();ctx.translate(rollX+width/2,rollY);drawBlanket(ctx,width,depth,this.spread,body.flutter,body.time);ctx.restore();
    }
    this.cuddle=Math.max(0,Math.min(1,(this.cuddle||0)+(this.phase==='rest'?1:-1)*dt/1.2));
    const cuddle=reduced?Number(this.phase==='rest'):picnicEase(this.cuddle);
    const motion={state:walking?'walk':this.phase==='rest'?'cuddle':'sit',sit:this.sit,cuddle,phase:guest.phase,t:this.elapsed,stretch:1,hop:0,crouch:0,impact:0,airborne:false};
    const height=c.height+(c.seated.height-c.height)*this.sit;
    guest.poseHeight=height;guest.ready=this.phase==='rest'&&!this.moving;guest.visible=true;
    const hit=new Path2D();
    hit.addPath(c.draw(ctx,{...at,x:guest.x,ground:guest.y,face,rot:.04*cuddle,accel:[0,0]},motion));
    const residentHit=settled && owner.draw(ctx,{...at,face:1,rot:-.12*cuddle,accel:[0,0]},
      {...motion,phase:0,state:this.phase==='rest'?'cuddle':'sit'});
    if(residentHit)hit.addPath(residentHit);
    if(this.spread>0){
      const points=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>blanketPoint(width,depth,this.spread,u,v,body.flutter,body.time));
      const cloth=new Path2D('M'+points.map(([x,y])=>[x+rollX+width/2,y+rollY].join(' ')).join(' L')+'Z');
      hit.addPath(cloth);
    }
    if(!['fetch','return'].includes(this.phase)) {
      const bob=walking&&!reduced?Math.sin(guest.phase*Math.PI*2)*1.5:0;
      const carryX=guest.x+c.width*.12;
      const basketX=carrying?carryX:placement+c.width*.12;
      const basketY=at.ground-(carrying?12*(1-this.basketDown):0)+bob*(1-this.basketDown)+body.basketDrop;
      const dangle=body.active?body.basket-body.angle:0;
      hit.addPath(drawBasket(ctx,basketX,basketY,walking?Math.sin(guest.phase*Math.PI*2)*.06:dangle,body.active?1:0));
    }
    if(this.phase==='rest'&&!reduced&&!this.moving)drawHeartEffect(ctx,{x:center,y:at.ground-Math.max(owner.seated.height,c.seated.height)-10,toX:null,colors:HEART_COLORS,t:this.elapsed%3.6,sway:0,dir:1});
    ctx.restore();
    const screenHit=new Path2D();screenHit.addPath(hit,matrix);
    return settled?screenHit:null;
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
