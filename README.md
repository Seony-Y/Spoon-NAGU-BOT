# NAGU BOT OAuth Server

Minimal Spoon OAuth callback server for Vercel.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the Spoon Client Secret after the app is approved.
3. Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
4. Run `npm run dev`.

The registered redirect URI must exactly match `SPOON_REDIRECT_URI`.

## Vercel environment variables

Configure every variable from `.env.example`. Use the production deployment URL for `SPOON_REDIRECT_URI`, for example:

```text
https://nagu-bot.vercel.app/oauth/callback
```

Tokens are encrypted with AES-256-GCM and stored only in an HttpOnly, Secure, SameSite=Lax cookie. The application does not print tokens to the page or server logs.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
