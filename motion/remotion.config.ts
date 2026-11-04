import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setEntryPoint('src/index.ts');

// The bundled headless shell dies on this machine ("GPU process isn't
// usable"), so drive the locally installed Chrome with software rendering.
Config.setBrowserExecutable('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
Config.setChromiumOpenGlRenderer('swangle');
Config.setDelayRenderTimeoutInMilliseconds(120_000);
