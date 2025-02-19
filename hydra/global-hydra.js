/* global Hydra */

var mainHydraCanvas = document.getElementById("main-hydra-canvas");

mainHydraCanvas.width = 1920;
mainHydraCanvas.height = 1080;

// create a new hydra-synth instance
var hydra = new Hydra({
  mainHydraCanvas,
  detectAudio: true,
  enableStreamCapture: true,
});

// TO-FIX
// - delete the old hydra instance before creating a new one
// - fix the logic (now there is a continous alternation between 1920 and 3840)

window.addEventListener("resize", () => {
  if (mainHydraCanvas.style.display !== "none"){
    if ((window.innerWidth >= 3840) && mainHydraCanvas.width !== 3840) {
      document.body.removeChild(mainHydraCanvas);
      mainHydraCanvas = document.createElement("canvas");
      mainHydraCanvas.id = "main-hydra-canvas";
      mainHydraCanvas.width = 3840;
      mainHydraCanvas.height = 2160;
      document.body.appendChild(mainHydraCanvas);
      hydra = new Hydra({
        mainHydraCanvas,
        detectAudio: true,
        enableStreamCapture: true,
      });
    }
    else if ((window.innerWidth < 3840) && mainHydraCanvas.width !== 1920) {
      document.body.removeChild(mainHydraCanvas);
      mainHydraCanvas = document.createElement("canvas");
      mainHydraCanvas.id = "main-hydra-canvas";
      mainHydraCanvas.width = 1920;
      mainHydraCanvas.height = 1080;
      document.body.appendChild(mainHydraCanvas);
      hydra = new Hydra({
        mainHydraCanvas,
        detectAudio: true,
        enableStreamCapture: true,
      });
    }
  }
});