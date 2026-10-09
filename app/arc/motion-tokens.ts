// Motion presets taken from arc-library (https://github.com/kuratlielia/arc-library, MIT, see LICENSE-arc-library.txt).
// Only what the vendored components in this folder use. D-021: motion in Clipbox follows arc-library.
export const motionTokens = {
  duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24 },
  ease: {
    enter: [0.16, 1, 0.3, 1],
    standard: [0.22, 1, 0.36, 1],
  },
  spring: {
    snappy: { type: "spring", visualDuration: 0.26, bounce: 0.12 },
    smooth: { type: "spring", visualDuration: 0.4, bounce: 0 },
    morph: { type: "spring", visualDuration: 0.42, bounce: 0.16 },
  },
  blur: { subtle: 2, soft: 4 },
} as const;
