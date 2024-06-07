/* eslint-disable no-undef */
// @ts-nocheck
s1.initImage('http://localhost:3000/envil_text.png');

noise(100, 12)
.brightness(-0.24)
.layer(
  src(s1)
    .scale(1.2)
    .invert().thresh()
    .modulatePixelate(noise(3).pixelate(8,8),2048,8)
).out(o0);