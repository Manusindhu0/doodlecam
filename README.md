# DoodleCam 🎨📷

Hey! I built this desktop app called **DoodleCam**. It's an Augmented Reality (AR) webcam application that lets you draw and doodle directly on your camera feed using your hands! 

I really wanted to make something fun with computer vision, so instead of using a mouse, you just hold up your hand and use gestures to interact with the feed in real-time.

## Features ✨

*   **Hand Tracking & Gestures:** Uses AI (MediaPipe) to track your hand. 
    *   Point your index finger to draw ☝️
    *   Pinch to move doodles around 🤏
    *   Open palm to erase ✋
*   **Holographic UI:** The app has a neat side panel where you can choose colors, brush sizes, and shapes (like circles, squares, etc.)
*   **Stickers!:** You can select emoji stickers and place them right on your video stream.
*   **Filters:** Pick from different camera filters and AR face filters like sunglasses or a masquerade mask.
*   **Capture Mode:** Take photos or record videos of your doodles right from the app!

## Tech Stack 🛠️

*   **Electron** (for the desktop wrapper)
*   **Vanilla JS, HTML, CSS** (no heavy front-end frameworks needed)
*   **MediaPipe** (for the computer vision / hand tracking logic)
*   **Canvas API** (for drawing strokes and rendering the webcam)

## How to Run Locally 🚀

If you want to try it out on your own machine:

1.  Clone this repository.
2.  Run `npm install` to grab the necessary dependencies.
3.  Run `npm start` to launch the app!
4.  *Make sure you have a webcam connected!*

You can also build it into an executable using `npm run build:win`.

---
*Created as a fun project to experiment with AI and desktop apps.*
