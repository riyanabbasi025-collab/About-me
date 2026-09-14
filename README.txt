LUCIAN VEX // V13 PRODUCTION GUIDE

WHAT THIS BUILD CONTAINS
- About Me editor
- Contact editor
- Manual Discord-style profile card
- Games / Anime / Skills / Network editors
- AniList search
- Professional Theme Manager
- Live wallpaper presets + custom image/video upload
- Cyber cursor + section/card animations
- Owner-only management controls
- Public visitors only see the finished profile and public theme controls

OWNER MODE
Press Ctrl + Shift + L, then enter the owner code shown in your private setup notes.
Owner Mode is a front-end workflow lock, not server-side authentication. Never put secrets/API keys in this site.

HOW PUBLISHING WORKS
1. Edit your site in Owner Mode.
2. Click EXPORT to download data.js.
3. Replace the published data.js in your Git repository.
4. Commit/push the change.
5. Your host redeploys the site and other devices receive the published data.

IMPORTANT: If you add a new local poster, the poster file itself must also be uploaded to the matching images/games or images/anime folder. data.js only stores the poster path.

BEST HOSTING WORKFLOW FOR LARGE POSTER LIBRARIES
Recommended: GitHub + GitHub Desktop + Netlify continuous deployment.

WHY
- Keep the entire site as a normal folder on your PC.
- Put thousands of posters into images/games and images/anime.
- GitHub Desktop detects changed/added files and pushes them together.
- Netlify watches the GitHub repository and automatically deploys after pushes.

BEGINNER SETUP
A) Install GitHub Desktop and sign into GitHub.
B) Use File > Clone Repository to clone your existing Lucian Vex repository to your PC.
C) Replace the local site files with this V13 build, preserving the images folders.
D) Open GitHub Desktop. Review the changed files.
E) Write a summary such as: "Update Lucian Vex portfolio".
F) Click Commit to main, then Push origin.
G) In Netlify choose Add new project > Import an existing project > GitHub, authorize Netlify, select the Lucian Vex repository, and publish it.
H) From then on, every push to the connected production branch automatically triggers a new Netlify deployment.

ADDING MANY POSTERS
Do NOT try to use the GitHub website uploader for thousands of images.
Instead, add them normally to your local folders:
images/games/
images/anime/
Then use GitHub Desktop to commit and push them.

POSTER PATH RULE
If the file is:
images/games/watch-dogs.jpg
then its game data poster value must be:
images/games/watch-dogs.jpg

If the file is:
images/anime/bleach.jpg
then its anime poster value must be:
images/anime/bleach.jpg

CUSTOM WALLPAPERS
Small local images/videos can be attached through the Theme Manager and exported into site data. For large live wallpapers, prefer a hosted MP4/WebM URL so data.js does not become huge.

UPDATING THE SITE LATER
CONTENT ONLY:
- Edit -> Export data.js -> replace data.js -> commit/push.

CODE / DESIGN CHANGES:
- Replace the changed site files (index.html, script.js, style.css, and any changed assets) -> commit/push.

TROUBLESHOOTING
If another device shows old content:
1. Confirm the new commit exists on the production branch.
2. Check Netlify Deploys for a successful deployment.
3. Open the public site in a private/incognito tab.
4. Confirm the changed poster file exists in the repository at the exact path used by data.js.

V13 NOTE
Theme state is now stored in the exported site data as well as locally, so published theme choices can travel to other devices through data.js.


V14 CLOUD EDITION
------------------
The cloud-enabled build uses Supabase as the shared data source when supabase-config.js is configured. Without Supabase configuration it falls back to the bundled data for safe previewing.

For production cloud sync, follow CLOUD_SETUP.txt exactly once.
