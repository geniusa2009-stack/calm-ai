// Generate a VAPID key pair. Put both in the SERVER environment; never commit them.
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`CALM_VAPID_PUBLIC_KEY=${k.publicKey}\nCALM_VAPID_PRIVATE_KEY=${k.privateKey}\nCALM_VAPID_SUBJECT=mailto:you@your-domain`);
