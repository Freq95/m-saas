import OpenAI from 'openai';
import { getDb } from './db';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ConversationContext {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  businessInfo?: {
    name?: string;
    services?: Array<{ name: string; price?: number; duration: number }>;
    workingHours?: string;
    address?: string;
  };
  availableSlots?: Array<{ start: string; end: string }>;
}

/**
 * Generates a suggested response in Romanian for a conversation
 */
export async function generateResponse(
  conversationId: number,
  userMessage: string,
  businessInfo?: ConversationContext['businessInfo'],
  availableSlots?: ConversationContext['availableSlots']
): Promise<string> {
  const db = getDb();
  
  // Get conversation history
  const messagesResult = await db.query(
    `SELECT direction, content, sent_at 
     FROM messages 
     WHERE conversation_id = $1 
     ORDER BY sent_at DESC 
     LIMIT 10`,
    [conversationId]
  );

  const conversationHistory = messagesResult.rows
    .reverse()
    .map((msg: any) => ({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.content,
    }));

  // Build system prompt
  let systemPrompt = `Ești un asistent AI pentru un business de servicii (salon, cabinet, atelier). 
Răspunde în română, profesional și prietenos. 
Nu face acțiuni autonome - doar sugerezi răspunsuri pe care utilizatorul le poate aproba.`;

  if (businessInfo) {
    systemPrompt += `\n\nInformații despre business:`;
    if (businessInfo.name) systemPrompt += `\nNume: ${businessInfo.name}`;
    if (businessInfo.address) systemPrompt += `\nAdresă: ${businessInfo.address}`;
    if (businessInfo.workingHours) systemPrompt += `\nProgram: ${businessInfo.workingHours}`;
    if (businessInfo.services && businessInfo.services.length > 0) {
      systemPrompt += `\nServicii disponibile:`;
      businessInfo.services.forEach(service => {
        systemPrompt += `\n- ${service.name} (${service.duration} min)`;
        if (service.price) systemPrompt += ` - ${service.price} lei`;
      });
    }
  }

  if (availableSlots && availableSlots.length > 0) {
    systemPrompt += `\n\nOre libere disponibile:`;
    availableSlots.forEach(slot => {
      const start = new Date(slot.start).toLocaleString('ro-RO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      systemPrompt += `\n- ${start}`;
    });
  }

  systemPrompt += `\n\nIMPORTANT: Sugerează un răspuns scurt, clar și profesional. Dacă clientul întreabă despre programare, propune orele disponibile.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return completion.choices[0]?.message?.content || 'Nu pot genera un răspuns în acest moment.';
  } catch (error: any) {
    console.error('Error generating AI response:', error);
    // Log more details for debugging
    if (error.response) {
      console.error('OpenAI API error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    }
    if (error.message) {
      console.error('Error message:', error.message);
    }
    throw new Error('Eroare la generarea răspunsului AI');
  }
}

/**
 * Analyzes a message and suggests tags
 */
export async function suggestTags(messageContent: string): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) {
    return [];
  }
  const db = getDb();
  
  const prompt = `Analizează următoarea conversație și sugerează tag-uri relevante din lista: "Lead nou", "Întrebare preț", "Reprogramare", "Anulare".
Răspunde doar cu tag-urile relevante, separate prin virgulă, sau "nicio" dacă nu se aplică.

Mesaj: "${messageContent}"`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Ești un sistem de clasificare pentru mesaje. Răspunde doar cu tag-uri sau "nicio".' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 50,
    });

    const response = completion.choices[0]?.message?.content?.toLowerCase() || '';
    
    if (response.includes('nicio') || response.trim() === '') {
      return [];
    }

    const suggestedTags: string[] = [];
    const allTags = ['lead nou', 'întrebare preț', 'reprogramare', 'anulare'];
    
    allTags.forEach(tag => {
      if (response.includes(tag.toLowerCase())) {
        suggestedTags.push(tag);
      }
    });

    return suggestedTags;
  } catch (error) {
    console.error('Error suggesting tags:', error);
    return [];
  }
}

