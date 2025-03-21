import type { Express } from "express";
import { Collection, Message, MessageMentions } from "discord.js";
import { Quote } from "./commands/quote";

const quotes: Collection<string, Quote> = new Collection();

export function replaceMentionsWithNames(
  message: string,
  mentions: MessageMentions<true>,
): string {
  for (const [id, user] of mentions.parsedUsers.entries()) {
    message = message.replaceAll(
      new RegExp(`<@!?${id}>`, "g"),
      "@" +
        (mentions.members.find((m) => m.user.id === user.id)?.displayName ??
          user.displayName ??
          user.username),
    );
  }
  return message;
}

export function convertMessageToQuote(
  message: Message<true>,
): Quote | undefined {
  // Check if the message is an embed
  if (
    message.embeds.length === 1 &&
    message.embeds[0].title !== null &&
    message.embeds[0].title.includes("Quote")
  ) {
    const embed = message.embeds[0];
    let author: Quote["quotee"] = embed.title ?? undefined;
    if (author == "Anonymous Quote") {
      author = undefined;
    }
    author = author?.replace("Quote of ", "");
    return {
      message: embed.description ?? "",
      quotee: author,
      timestamp: new Date(embed.timestamp || message.createdTimestamp),
    };
  } else {
    const messageContent = message.content;
    if (!messageContent.startsWith("> ")) {
      return undefined;
    }
    const quoteBody = messageContent;
    if (message.mentions.parsedUsers.size > 0) {
      return {
        message: replaceMentionsWithNames(quoteBody, message.mentions),
        quotee: message.mentions.parsedUsers
          .map(
            (user) =>
              message.mentions.members.find((m) => m.user.id === user.id)
                ?.displayName ??
              user.displayName ??
              user.username,
          )
          .join(", "),
        timestamp: message.createdAt,
      };
    } else {
      // Guess the quotee
      const quotee = messageContent
        .split("\n")
        .find((line) => !line.startsWith("> "));
      if (quotee === undefined) {
        return undefined;
      }
      return {
        message: quoteBody,
        quotee,
        timestamp: message.createdAt,
      };
    }
  }
}

export async function refreshQuotes() {
  console.log("Refreshing quotes");
  const quotesChannel = await globalThis.cssaGuild.channels.fetch(
    "1169166790094491678",
  );
  if (quotesChannel === null) {
    throw new Error("Quotes channel is null");
  } else if (!quotesChannel.isTextBased()) {
    throw new Error("Quotes channel is not text based");
  }
  // Start fetching recent top-level messages
  let hitCachedMessage = false;
  let messages = await quotesChannel.messages.fetch({
    limit: 100,
  });
  while (!hitCachedMessage && messages.size > 0) {
    messages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const message of messages.values()) {
      const quote = convertMessageToQuote(message);
      if (quote !== undefined) {
        if (quotes.has(message.id)) {
          if (!hitCachedMessage) {
            console.log(`Hit cached message - ${message.id}`);
          }
          hitCachedMessage = true;
        } else {
          console.log(`Adding new quote - ${message.id}`);
        }
        quotes.set(message.id, quote);
      }
    }
    if (!hitCachedMessage) {
      const lastMessage = messages.last();
      if (lastMessage === undefined) {
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      messages = await quotesChannel.messages.fetch({
        limit: 100,
        before: lastMessage.id,
      });
    }
  }
  return;
}

export async function attachQuotesServer(app: Express) {
  await refreshQuotes();
  app.get("/quotes", (_, response) => {
    refreshQuotes().then(() => {
      response.set("Content-Type", "application/json");
      response.send(
        JSON.stringify({
          quotes: [...quotes.entries()]
            .map(([messageId, quote]) => ({ messageId, ...quote }))
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
        }),
      );
    });
  });
}
