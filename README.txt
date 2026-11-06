Lecture Notes – Voice to Text

1. Open this folder in VS Code.
2. Install the "Live Server" extension.
3. Right-click index.html > "Open with Live Server".
4. Use Chrome or Edge, and allow the microphone.

Just press start and speak in English, Tagalog, or Bisaya — you can mix them.
The app detects the language automatically, so there is no language menu to pick.
The status line shows the detected language, for example "Listening… · Bisaya".
If English, Tagalog, and Bisaya are mixed together, the status shows "Mixed" and the Filipino engine is used. This is best effort, because the browser can only listen with one language engine at a time.
Bisaya uses the Filipino voice engine, so some words may come out wrong.
A small cleanup step fixes common Bisaya mistakes, but this is still best effort.
Periods are added only at natural pauses or long chunks, so the transcript is less choppy.
Use the Read button to hear the note read aloud.
Read prefers the Microsoft Natasha Online (Natural) English (Australia) voice. If it is not installed, another available voice is used.

Files: index.html (page), style.css (design), script.js (logic).
Notes and folders are saved in the browser (localStorage).
