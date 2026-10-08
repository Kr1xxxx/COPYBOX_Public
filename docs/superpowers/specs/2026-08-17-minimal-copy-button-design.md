# Minimal Copy Button Design

## Goal

Make the card copy action visually quieter and simpler without changing what is copied or how quickly copying works.

## Design

- Reduce the copy button from 28×28 to 24×24 pixels and its trailing card column from 36 to 32 pixels.
- Keep the familiar overlapping-page outline, but reduce its size and stroke so it reads as a secondary action.
- Remove the large green “已复制” overlay and the copied-state animation on the whole card.
- After copying, change only the copy button from the page icon to a small green check for 1.25 seconds.
- Keep pin and optional preparation controls visible and stationary during feedback.
- Preserve the dynamic accessible label and announce “已复制” through visually hidden live-region text.
- Add a visible keyboard focus ring. No new dependency and no changes to card height, copy data, or clipboard timing.

## Verification

Automated source checks must reject the removed overlay and enforce the compact button, in-place success state, focus treatment, and live-region text. The packaged app must then be inspected at its normal window size and exercised with a real copy click.
