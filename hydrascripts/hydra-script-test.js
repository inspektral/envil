// Puertas II
// por Celeste Betancur
// https://github.com/essteban

let r = 0.3;
let g = 1;
let b = 1;
let k = 4;
let mod = 0;

osc(13,0,1)
  .kaleid(()=>k)
  .mask(shape(4,0.3,1))
  .modulateRotate(shape(4,0.1,1))
  .modulateRotate(shape(4,0.1,0.9))
  .modulateRotate(shape(4,0.1,0.8))
  .scale(0.3)
  .add(shape(4,0.2,1).color(()=>r,()=>g,()=>b,0.5))
  .modulate(
    osc(6,0,1.5).brightness(-.5)
    .modulate(noise(3).sub(gradient()),1), ()=>mod
  )
  .rotate(0,1)
  .scale(1,()=>window.innerHeight/window.innerWidth)
  .out();

osc(12,.2, 1).kaleid(2).out();
noise().kaleid(15).out();