import {
  DbConnection,
  tables,
  reducers
} from '../lib/spacetimedb';
import GlobalMessageType from '../lib/spacetimedb/global_message_type';
import type { Infer } from 'spacetimedb';

type GlobalMessage = Infer<typeof GlobalMessageType>;

class CloudService {
  private conn: DbConnection | null = null;
  private connected = false;
  private messages: GlobalMessage[] = [];

  // Callback for Svelte to update UI
  private onMessageCallback: ((msgs: GlobalMessage[]) => void) | null = null;

  constructor() { }

  async connect(host: string = 'http://127.0.0.1:3000', dbName: string = 'cachy-server', token?: string) {
    if (this.connected) return;

    console.log('Connecting to SpacetimeDB...', host);

    // Initialize the connection
    try {
      this.conn = DbConnection.builder()
        .withUri(host)
        .withModuleName(dbName)
        .withToken(token || "") // Anonymous or token
        .onConnect((ctx) => {
          console.log("Connected to SpacetimeDB!", ctx);
          this.connected = true;

          // Subscribe to queries
          const sub = this.conn?.subscriptionBuilder();
          if (sub) {
            sub.onApplied((ctx) => {
              console.log("Subscription applied", ctx);
            })
              .subscribeToAllTables();
          }
        })
        .onDisconnect((ctx) => {
          console.log("Disconnected from SpacetimeDB", ctx);
          this.connected = false;
        })
        .build();
    } catch (e) {
      console.error("Failed to build/connect SpacetimeDB connection:", e);
    }

    // Handle row updates with robustness
    try {
      // Try snake_case if camelCase fails, as SpacetimeDB often generates snake_case for tables
      const globalMessageTable = (tables as any).globalMessage || (tables as any).global_message;

      if (globalMessageTable && typeof globalMessageTable.onInsert === 'function') {
        globalMessageTable.onInsert((ctx: any, row: any) => {
          console.log("New Message Received:", row);
          this.messages = [...this.messages, row];
          if (this.onMessageCallback) this.onMessageCallback([...this.messages]);
        });
      } else {
        console.warn("SpacetimeDB: globalMessage table handle not found or not initialized yet.");
      }
    } catch (e) {
      console.error("Error setting up SpacetimeDB table listeners:", e);
    }
  }

  sendMessage(text: string) {
    if (!this.connected) {
      console.warn("Cannot send message: Not connected");
      return;
    }
    // The reducers object is exported from the generated code and handles calling the server
    (reducers as any).sendMessage(text);
  }

  subscribeMessages(cb: (msgs: GlobalMessage[]) => void) {
    this.onMessageCallback = cb;
    cb(this.messages);
  }
}

export const cloudService = new CloudService();
