import { springTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { Audio, interpolate, Sequence, staticFile } from "remotion";
import {
  CHAR_FRAMES,
  COMMAND,
  SCENE_COVERAGE_BAR_DURATION_FRAMES,
  SCENE_TYPING_DURATION_FRAMES,
  TRANSITION_DURATION_FRAMES,
  TYPING_INITIAL_DELAY_FRAMES,
  VIDEO_FPS,
} from "../constants";
import { CoverageBar } from "../scenes/coverage-bar";
import { SplitScreen, SPLIT_SCREEN_DURATION_FRAMES } from "../scenes/split-screen";
import { TerminalTyping } from "../scenes/terminal-typing";

const MUSIC_START_SECONDS = 27;
const MUSIC_START_FRAME = MUSIC_START_SECONDS * VIDEO_FPS;
const MUSIC_VOLUME = 0.15;
const MUSIC_FADE_IN_SECONDS = 6;
const MUSIC_FADE_IN_FRAMES = MUSIC_FADE_IN_SECONDS * VIDEO_FPS;
const TYPING_SOUND_START_SECONDS = 3;
const TYPING_SOUND_START_FRAME = TYPING_SOUND_START_SECONDS * VIDEO_FPS;
const TYPING_DURATION_FRAMES = COMMAND.length * CHAR_FRAMES;

export const Main = () => {
  return (
    <>
      <Audio
        src={staticFile("music.wav")}
        startFrom={MUSIC_START_FRAME}
        volume={(frame) =>
          MUSIC_VOLUME *
          interpolate(frame, [0, MUSIC_FADE_IN_FRAMES], [0, 1], {
            extrapolateRight: "clamp",
          })
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_TYPING_DURATION_FRAMES}>
          <TerminalTyping />
          <Sequence from={TYPING_INITIAL_DELAY_FRAMES} durationInFrames={TYPING_DURATION_FRAMES}>
            <Audio src={staticFile("typing.mp3")} startFrom={TYPING_SOUND_START_FRAME} />
          </Sequence>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: TRANSITION_DURATION_FRAMES,
          })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_COVERAGE_BAR_DURATION_FRAMES}>
          <CoverageBar />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: TRANSITION_DURATION_FRAMES,
          })}
        />

        <TransitionSeries.Sequence durationInFrames={SPLIT_SCREEN_DURATION_FRAMES}>
          <SplitScreen />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};
