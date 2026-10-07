# Prompts used to build Keepsake

Built with Claude. Prompts are cleaned up from the original messages.

## Prompt 1: project spec

Build a hosted web app where users chat with their own AI agent.

1. Login: Sign in with ChatGPT, Google and X. Claude connects by API key, since it has no account login.
2. Connect your agent: after login, every user links their agent (API key or endpoint). Google and X users must finish this step to continue.
3. Chat: the user talks to their agent through a backend that holds keys and forwards messages.
4. Consent enforcer: recording is off by default. The user opts in explicitly, and the backend only saves chats to Walrus Memory while consent is on. Users can pause, export and delete.
5. Prompt source selector: the user marks a prompt as "From Prompted" or "My own". Tagged prompts are tracked separately.
6. Breakdown on request: the agent summarizes the tracked prompts whenever asked.
7. Hosting: a working public deployment, first on a free Vercel domain, later a custom domain.

## Prompt 2: phase 0, demo mode

Build the demo-mode interface first: a single-page chat with scripted agent replies, no login and no keys, so anyone can try it from the "Try it now" link. Include the consent toggle with a confirmation dialog, export and delete controls, the prompt-source selector, and a /breakdown command.

## Prompt 3: branding

Rename the app to Keepsake and restyle the interface to match the logo: dark navy background, teal and coral accents, tagline "Your AI. Your memory. Your choice."
