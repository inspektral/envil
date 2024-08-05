/* global Hydra */

const canvas = document.getElementById("main-hydra-canvas");

canvas.width = 1920;
canvas.height = 1080;

// create a new hydra-synth instance
let hydra = new Hydra({
  canvas,
  detectAudio: true,
  enableStreamCapture: true,
})