# TreeHacks 2021

Also brought to you by [Aidan](https://github.com/ajwitt212), [Brian](https://github.com/brian-yu) and [Emily](https://github.com/emilyychenn). As with any fun project, you never do it alone.

The premise of this project was the idea that some degree of contemporary social media inherently forms echo chambers, and this was a prototype of reinveting this - with no more large influencing/following and attempting to find a things in common in a coffee chat asking about opinions - hence the "common grounds" pun. 

Whatever we brewed up, we forgot to keep the secrets in the secrets section and have mirrored and redacted various components of this project (search for "REDACTED"). As such, you'll need to replace them with your own secrets (hopefully clearly labeled) 

As we speak, there's a front-end at https://commongrounds.app/, and a backend at https://finebrew.azurewebsites.net/questions (HTTPS only), but we make no promises about reliability or uptime (it'll probably be taken down after treehacks)  

### Setup instructions

In one terminal tab:
- `cd frontend`
- `touch .env.local`
- `echo "NEXT_PUBLIC_SOCKET_HOST=ws://localhost:8080\nNEXT_PUBLIC_BACKEND_HOST=http://localhost:8080\n" >> .env.local`
- `yarn install`
- `yarn dev`

In another terminal tab:
- `cd backend`
- `pip install -r requirements.txt`
- `python server.py`

In your browser, go to http://localhost:3000
