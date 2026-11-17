# QuizBlast ⚡ Party Trivia

A real-time multiplayer trivia game for team meetings, family parties and adult game nights.
The host runs the game on a big screen (or shares their screen on Zoom/Teams/Meet), and up to
20 players join from their phones with a 4-letter room code.

## Features

- **3 game types, 10 categories each, 600 original questions**
  - 💼 Office Ice Breaker: geography, movies & TV, music, food, science, tech, sports, history, business, language
  - 🎈 Family Fun: animals, animated movies, space, storybooks, food, our planet, games & toys, human body, inventions, holidays
  - 🍸 Adult Game Night: cocktails, 90s, 2000s, movie quotes, binge TV, chart toppers, celebrity scoop, love & dating, internet & memes, wild history (cheeky, not explicit)
- **Rounds of 20, 40 or 60 questions.** Each category holds 20 questions, so pick 1+ categories for 20, 2+ for 40, 3+ for 60. Questions are mixed evenly across the categories you pick.
- **Optional timer:** off, 10, 15, 20, 30 or 45 seconds. With the timer off, the host reveals when ready (or it reveals as soon as everyone has answered).
- **Character avatars:** 12 characters × 8 colors.
- **Answers lock in** the moment a player taps, and their choice is highlighted.
- **Scoring:** 1 point for a correct answer, plus a speed bonus by order of correct answers: 1st +5, 2nd +4, 3rd +3, 4th +2, 5th +1.
- **Reveal:** each player sees their answer next to the correct answer; the host screen shows answer counts, the fastest correct players and the leaderboard.
- **Team mode:** 2–4 teams. Players are auto-balanced and can switch teams in the lobby; the host can click a player to move them. Team score = sum of its players' points.
- **Sound:** upbeat game-show music on the host screen, a buzzer when the timer runs out, ticks in the last 5 seconds, lock-in, correct/wrong and a final fanfare. All generated in the browser, nothing to download.
- QR code + join link, reconnects after a refresh, play again with the same room.

## Run it on your computer

Needs [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000 on the host computer and click **Create a room**. The host screen and
QR code automatically show your computer's Wi-Fi address (like `http://192.168.1.20:3000`), which
phones on the same Wi-Fi can open. The terminal prints that address too.

If phones still can't connect: make sure they're on the same Wi-Fi (not mobile data or a guest
network), and allow Node.js through your computer's firewall when it asks. For players elsewhere,
deploy it (below).

## Deploy it (free) so anyone can join

**Render (easiest):** push this folder to a GitHub repo, then on render.com choose
**New → Blueprint**, pick the repo, and it uses `render.yaml` automatically. You get a URL like
`https://quizblast.onrender.com` to share. (Free instances sleep when idle; the first load takes ~30s.)

**Railway / Fly.io / any Docker host:** a `Dockerfile` is included. The app listens on `$PORT`.

Note: rooms live in memory on one server, so run a single instance.

## Customize

- **Questions:** edit `questions/office.js`, `questions/family.js`, `questions/adult.js`.
  Each question is `['Question?', 'Correct answer', 'Wrong 1', 'Wrong 2', 'Wrong 3']`; answers are shuffled each game.
  Add more than 20 per category and bigger rounds from fewer categories just work.
- **Your own music / buzzer:** drop `music.mp3` and/or `buzzer.mp3` into `public/audio/`. They replace the built-in sounds automatically.
- **Scoring:** `SPEED_BONUS` at the top of `server.js`.
- **Max players:** `MAX_PLAYERS` in `server.js`.
