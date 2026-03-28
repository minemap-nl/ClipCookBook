import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSmtpTransporter } from '@/lib/smtp';

export async function POST(req: Request) {
  try {
    const { recipeId, targetEmail } = await req.json();
    if (!recipeId || !targetEmail) return NextResponse.json({ error: "Missende gegevens" }, { status: 400 });

    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: { ingredients: true, steps: { orderBy: { order: 'asc' } } }
    });

    if (!recipe) return NextResponse.json({ error: "Recept niet gevonden" }, { status: 404 });

    const transporter = getSmtpTransporter();

    const ingredientsHtml = recipe.ingredients.map(i =>
      `<li style="padding: 4px 0;">${i.amount || ''} ${i.unit || ''} ${i.name}</li>`
    ).join('');

    const stepsHtml = recipe.steps.map(s =>
      `<li style="padding: 6px 0; line-height: 1.5;">${s.description}</li>`
    ).join('');

    const appName = process.env.APP_NAME || 'ReteraRecepten';
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const shareLink = `${baseUrl}/share/${recipe.id}`;

    const html = `
      <div style="font-family: 'Poppins', sans-serif; background-color: #F8F9FA; color: #222222; padding: 40px 20px; max-width: 600px; margin: 0 auto; border: 1px solid #EAEAEA; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-radius: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #FF5A5F; margin: 0; font-size: 28px;">${recipe.title}</h1>
          <p style="color: #FFB400; margin-top: 5px; font-weight: 500;">Vers uit de keuken van ${appName}</p>
        </div>
        
        <div style="background-color: #FFFFFF; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
          <h3 style="color: #FF5A5F; border-bottom: 2px solid #EAEAEA; padding-bottom: 8px; margin-top: 0;">Boodschappenlijstje (voor ${recipe.portions} personen)</h3>
          <ul style="list-style-type: square; color: #555555;">
            ${ingredientsHtml}
          </ul>
        </div>

        <div style="background-color: #FFFFFF; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
          <h3 style="color: #FF5A5F; border-bottom: 2px solid #EAEAEA; padding-bottom: 8px; margin-top: 0;">Bereidingswijze</h3>
          <ol style="color: #555555; padding-left: 20px;">
            ${stepsHtml}
          </ol>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${shareLink}" style="display: inline-block; background-color: #FF5A5F; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 16px;">Bekijk Video en Recept Online</a>
        </div>

        <div style="margin-top: 40px; font-size: 0.9em; text-align: center; color: #888888;">
          <p>Verzonden via <strong style="color: #FF5A5F;">${appName}</strong>.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"${appName}" <${process.env.SMTP_USER}>`,
      to: targetEmail,
      subject: `Recept: ${recipe.title}`,
      html
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("SMTP ERROR DETAILS:", e);
    return NextResponse.json({ error: "E-mail kon niet worden verzonden", details: e.message }, { status: 500 });
  }
}
