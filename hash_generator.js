// hash_generator.js (Jalankan file ini di terminal)

const bcrypt = require("bcrypt");
const passwordToHash = "default123";
const saltRounds = 10;

bcrypt.hash(passwordToHash, saltRounds, function (err, hash) {
  if (err) {
    console.error("Error saat hashing:", err);
    return;
  }
  console.log(
    "-----------------------------------------------------------------------"
  );
  console.log(`Password: ${passwordToHash}`);
  console.log(`Hash Baru (bcrypt): ${hash}`);
  console.log(
    "-----------------------------------------------------------------------"
  );
});
