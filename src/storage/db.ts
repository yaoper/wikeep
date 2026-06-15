import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Conversation, Message, WikiPage } from "../shared/types";
import { DB_NAME, DB_VERSION } from "../shared/constants";

interface WikeepDBSchema extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      "by-updatedAt": number;
      "by-sourceUrl": string;
      "by-sourceSessionId": string;
    };
  };
  messages: {
    key: string;
    value: Message;
    indexes: {
      "by-conversationId": string;
      "by-conversationId-order": [string, number];
    };
  };
  pages: {
    key: string;
    value: WikiPage;
    indexes: {
      "by-updatedAt": number;
      "by-url": string;
      "by-repoFullName": string;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<WikeepDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<WikeepDBSchema>> {
  if (!databasePromise) {
    databasePromise = openDB<WikeepDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const conversations = database.createObjectStore("conversations", {
            keyPath: "id",
          });
          conversations.createIndex("by-updatedAt", "updatedAt");
          conversations.createIndex("by-sourceUrl", "sourceUrl", {
            unique: true,
          });
          conversations.createIndex("by-sourceSessionId", "sourceSessionId", {
            unique: false,
          });

          const messages = database.createObjectStore("messages", {
            keyPath: "id",
          });
          messages.createIndex("by-conversationId", "conversationId");
          messages.createIndex("by-conversationId-order", [
            "conversationId",
            "order",
          ]);
        }

        if (oldVersion < 3) {
          const pages = database.createObjectStore("pages", {
            keyPath: "id",
          });
          pages.createIndex("by-updatedAt", "updatedAt");
          pages.createIndex("by-url", "url", { unique: true });
          pages.createIndex("by-repoFullName", "repoFullName");
        }
      },
    });
  }

  return databasePromise;
}
