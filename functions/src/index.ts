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
  dag: {
    ...FU.synchronizer(db, `user/{user_id}/dag/{dag_id}`, `user/{user_id}/dag_head/{dag_id}`, {
      write: change => _.omit(change.after.data(), "nodes", "links"),
      delete: true,
    }),
  }
};
