// Shared scene composition. Characters own poses/accessories; heart.js owns effect timing and size.
function drawPicnic(ctx, left, right, t, reduced = false) {
  const a=left.seated, b=right.seated, span=(a.width+b.width)*.65;
  const width=span+100, depth=Math.max(a.height,b.height)*.65;
  const path=(d,fill,ink='#765340',w=1.8)=>{const p=new Path2D(d);ctx.lineJoin=ctx.lineCap='round';if(fill){ctx.fillStyle=fill;ctx.fill(p)}if(ink){ctx.strokeStyle=ink;ctx.lineWidth=w;ctx.stroke(p)}return p};
  const cols=9,rows=5;
  const point=(col,row)=>{const u=col/cols,v=row/rows;return [-width/2+width*.1*(1-v)+u*width*(.8+.2*v)+Math.sin(col*1.6+row*.8)*.5,-depth*.65+depth*v+Math.sin(u*Math.PI)*3*v]};
  function edge(c,r,h,reverse=false){const a=point(c,r),b=point(c+(h?1:0),r+(h?0:1));const q=[(a[0]+b[0])/2+(h?0:Math.sin(c+r*1.7)*.8),(a[1]+b[1])/2+(h?Math.sin(c*1.2+r)*.8:0)];return `Q ${q[0]} ${q[1]} ${(reverse?a:b).join(' ')}`}
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)path(`M ${point(c,r).join(' ')} ${edge(c,r,true)} ${edge(c+1,r,false)} ${edge(c,r+1,true,true)} ${edge(c,r,false,true)} Z`,(c+r)%2?'#fff9eb':'#cf5361',null);
  let outline=`M ${point(0,0).join(' ')}`;
  for(let c=0;c<cols;c++)outline+=' '+edge(c,0,true);
  for(let r=0;r<rows;r++)outline+=' '+edge(cols,r,false);
  for(let c=cols-1;c>=0;c--)outline+=' '+edge(c,rows,true,true);
  for(let r=rows-1;r>=0;r--)outline+=' '+edge(0,r,false,true);
  path(outline+' Z',null,'#a94d60',1.5);
  const cuddle=reduced ? 1 : .6+.4*(1-Math.cos(t*Math.PI/4))/2;
  const separation=(a.width+b.width)*.29;
  const at={ground:0,face:1,rot:0,accel:[0,0],dt:1/30,now:t*1000};
  const motion={state:'cuddle',cuddle,phase:0,t,stretch:1,hop:0,crouch:0,impact:0,airborne:false};
  right.draw(ctx,{...at,x:separation/2-5,rot:-.12*cuddle},motion);
  const hit = left.draw(ctx,{...at,x:-separation/2-5,rot:.04*cuddle},motion);
  ctx.save();ctx.translate(width/2-28,-depth*.25);ctx.scale(.55,.55);
path('M-23-23C-28-61 22-64 24-23',null,'#765340',6);path('M-23-23C-28-61 22-64 24-23',null,'#e4bf82',3);
const basket=path('M-36-25Q-34-5-29 13Q-1 24 30 14Q35-3 36-25Z','#e5be83','#765340',2);
ctx.save();ctx.clip(basket);path('M22-26Q25 3 19 17Q30 16 32 12L37-24Z','#c99b62',null);
for(let y=-13;y<17;y+=9)path(`M -36 ${y} Q -6 ${y+5} 35 ${y+1}`,null,'#bc925f',1.2);
for(let x=-25;x<33;x+=12)path(`M ${x} -23 Q ${x-2} -2 ${x*.86} 20`,null,'#bc925f',1.2);
ctx.restore();path('M-38-28C-24-36 21-36 38-27L36-21Q1-15-37-22Z','#f0d19c','#765340',2);
path('M-29-27Q-1-31 29-26',null,'#c69e69',1.2);
  ctx.restore();
  if (!reduced) drawHeartEffect(ctx,{x:-5,y:-Math.max(a.height,b.height)*1.05,toX:null,colors:HEART_COLORS,t:t%3.6,sway:0,dir:1});
  return { hit, leftX: -separation/2-5, rightX: separation/2-5 };
}
