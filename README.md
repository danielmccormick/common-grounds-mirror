# Setup instructions

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