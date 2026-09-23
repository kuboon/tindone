import { createTursoDatabase } from "@remix-kbn/data-table-sqlite-turso";
import { createClient } from "@libsql/client/web";
export default {
  fetch() {
    return new Response(
      String(createTursoDatabase(createClient({ url: "libsql://x" }))),
    );
  },
};
