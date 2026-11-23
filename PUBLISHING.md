# Publishing Glide to the Chrome Web Store

Everything Google needs is already in this folder. Only you can do the steps below, because they need your Google account and payment. Plan for about 20 minutes, then a review wait.

Google changes the dashboard now and then, so a button may have a slightly different name than the one written here.

## What you'll upload
| What | File |
|---|---|
| The extension | `glide-webstore-v1.0.0.zip` |
| Listing text and answers | `store/LISTING.md` |
| Icon, screenshots and promo tiles | everything in `store/` ending in `.png` |

## Step 1: Register as a Chrome Web Store developer (one time, $5)
1. Go to **https://chrome.google.com/webstore/devconsole** and sign in with the Google account you want to publish under. Your account's name or email may be shown publicly as the publisher, so use one you're happy with.
2. Accept the developer agreement.
3. Pay the **one-time $5 registration fee**.
4. Fill in the **Account** page. You'll need a contact email, and Google will ask you to verify it with a link.

## Step 2: Upload the extension
1. In the dashboard, click **New item** (sometimes shown as **+ Add new item**).
2. Upload **`glide-webstore-v1.0.0.zip`**. Don't unzip it.
3. The dashboard reads the name, summary, version and icon from the zip automatically.

## Step 3: Fill in the Store listing tab
Open `store/LISTING.md` and copy each part in:
1. **Description**: paste the whole block.
2. **Category**: Tools. **Language**: English.
3. **Store icon**: `store/store-icon-128.png`.
4. **Screenshots**: upload the three `screenshot-…png` files, in order 1, 2, 3.
5. **Small promo tile**: `store/promo-small-440x280.png`.
6. **Marquee promo tile** (optional): `store/promo-marquee-1400x560.png`.
7. **Homepage / Support URL** (optional): your GitHub repo and its Issues page.
8. Click **Save draft**.

## Step 4: Fill in the Privacy practices tab
This is the part people most often get stuck on. Every answer is already written in `store/LISTING.md`:
1. Paste the **single purpose** sentence.
2. Paste the three **permission justifications** (activeTab, scripting, storage).
3. **Remote code**: choose **No**.
4. **Data usage**: tick **nothing** in the list of data types, then tick the **three certification boxes** at the bottom.
5. **Privacy policy URL**: paste the GitHub link to `PRIVACY.md` (it works once the repo is public).
6. **Save draft**.

## Step 5: Distribution tab
- Free, **Public**, all regions. **Save draft**.

## Step 6: Submit
1. Click **Submit for review**. If the button is greyed out, the dashboard shows which box is still missing.
2. You'll be asked whether to publish automatically once it's approved. Leaving that on is fine.
3. Reviews usually take from a day to a couple of weeks. Glide uses only small permissions, which tends to help, but I can't promise a time. Google emails you the result.

If it's rejected, the email says why. Paste it in our thread and I'll fix whatever they flag.

## Publishing an update later
1. Make the change and test it with **Load unpacked**.
2. Raise `"version"` in `extension/manifest.json`, for example from `1.0.0` to `1.0.1`. The store refuses a zip with the same version as before.
3. Zip the **contents** of the `extension` folder: select all the files inside it, then right-click, **Send to**, **Compressed (zipped) folder**. Don't zip the folder itself.
4. In the dashboard, open Glide, go to **Package**, then **Upload new package**, and submit for review again.
