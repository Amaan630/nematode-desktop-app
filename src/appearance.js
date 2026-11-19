// A character instance carries its whole appearance wherever it is drawn or sent.
function characterAppearance(value) {
  const appearance = value?.appearance || value;
  return typeof appearance === 'string' ? { character: appearance, accessories: {} }
    : { ...appearance, accessories: { ...appearance?.accessories } };
}
function createCharacter(value) {
  const appearance = characterAppearance(value), base = CHARACTERS[appearance.character];
  if (!base) return null;
  const instance = base.create?.() || { ...base };
  instance.appearance = appearance;
  instance.create = () => createCharacter(instance.appearance);
  instance.draw = (ctx, at, motion) => base.draw.call(instance, ctx, { ...at, appearance: instance.appearance }, motion);
  return instance;
}

// The tray and character previews use the same dressed instance as the desktop.
function renderCharacterPreview(value, size = 64) {
  const source = document.createElement('canvas'); source.width = source.height = 256;
  const ctx = source.getContext('2d'), character = createCharacter(value);
  character.draw(ctx, {x:128,ground:210,face:1,rot:0,accel:[0,0],dt:.016,now:1000,zoom:2},
    {state:'idle',phase:0,t:0,stretch:1,hop:0,crouch:0,impact:0,airborne:false});
  const pixels = ctx.getImageData(0,0,256,256).data;
  let left=256, top=256, right=0, bottom=0;
  for(let y=0;y<256;y++) for(let x=0;x<256;x++) if(pixels[(y*256+x)*4+3]) {
    left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
  }
  const out=document.createElement('canvas'); out.width=out.height=size;
  const width=right-left+1, height=bottom-top+1, scale=(size-4)/Math.max(width,height);
  out.getContext('2d').drawImage(source,left,top,width,height,(size-width*scale)/2,(size-height*scale)/2,width*scale,height*scale);
  return out;
}
