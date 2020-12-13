import * as _ from 'lodash'
import * as admin from 'firebase-admin'
// import * as functions from 'firebase-functions';
import * as FU from './func_util'

admin.initializeApp({});
const db = admin.firestore();
db.settings({ timestampsInSnapshots: true })

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });


exports.datahooks = {
  net: {
    ...FU.synchronizer(db, `user/{user_id}/net/{id}`, {
      // 本体 -> 検索
      [`user/{user_id}/net_head/{id}`]: {
        write: change => _.omit(change.after.data(), "nodes", "links", "links_appearance"),
        delete: true,
      },
      // 本体 -> グローバル検索
      [`net_head/{user_id}_{id}`]: {
        write: change => _.omit(change.after.data(), "nodes", "links", "links_appearance"),
        delete: true,
      },
      // 本体 -> グローバル本体
      [`net/{user_id}_{id}`]: {
        write: change => change.after.data(),
        delete: true,
      },
    }),
  }
};
