---
title: "Architectuur"
description: "Een technische duik in hoe de applicatie werkt."
date: "2024-03-07"
order: 4
---
# Achter de Schermen (Architectuur)

Voor de nieuwsgierige ontwikkelaars legt deze pagina uit hoe ClipCookBook onder de motorkap in elkaar steekt.

## Frontend & Backend
De kern van de applicatie is gebouwd met **Next.js (App Router)**. Dit stelt ons in staat om naadloos React componenten en server-side API routes (`Route Handlers`) te bouwen op hetzelfde platform. We gebruiken **Bun** als runtime en package manager voor optimale snelheid.

- **Styling**: Wordt verzorgd door Tailwind CSS voor strakke en consistente componenten.
- **Data Opslag**: Prisma is gekozen als ORM. Het communiceert met een lokale SQLite database om de infrastructuur-eisen (en kosten!) minimaal te houden voor self-hosting. 

## Hoe Extractie Werkt
Wanneer een gebruiker een URL indient:
1. De Next.js API route accepteert de URL.
2. Een proces genaamd `yt-dlp` (geïnstalleerd en geconfigureerd voor container of host) wordt aangeroepen om de videobestanden te extraheren en te downloaden.
3. Indien nodig wordt `ffmpeg` ingezet om video naar een geschikt formaat om te zetten voor analyse.
4. De media (video/audio of direct beelden) worden aangeboden aan de **Google Gemini API**, specifiek geprompt met instructies om ingrediënten en de stap-voor-stap methode om het gerecht te bereiden, te identificeren.
5. De AI-output wordt geparset en, samen met de link naar de fysieke videobestanden die lokaal zijn opgeslagen verbonden in Prisma, en klaargezet voor de frontend.

## Documentatie Rendering
Je leest deze documentatie op een aparte informatie-website aangedreven door Python en Flask.
- Bestanden worden opgeslagen in de `content/` map en geschreven in Markdown.
- Een simpele Flask webserver leest de bestanden lokaal in, onttrekt de metadata via `python-frontmatter` en toont de HTML output via de `markdown` library voor Python.
