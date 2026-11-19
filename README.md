# Reel Odds
 
Reel Odds is a fishing log that learns from your own trips. You record where you fished, the weather, and exactly what you were fishing with, and the app turns that history into charts and a prediction of your chance of catching a given species under conditions you choose.
 
> **Status: synthetic data only.** No real fishing data has been logged yet. Every model, number, and result in this repository, including anything shown on the Predict page, comes from randomly generated sample data and says nothing about real fishing. The synthetic generator exists only to test that the pipeline and interface work. It will be replaced with real logs as trips are recorded.
 
## The idea
 
Most fishing apps report general conditions or rely on other people's catches. Reel Odds asks a narrower question: given what has worked for you, at the places you fish, with the gear you own, what should you expect today? The answer is a probability, such as the chance of at least one largemouth bass in a three-hour session, together with a breakdown of which factors are helping or hurting and which rigs, lures, baits, or locations look best under the current conditions.
 
A useful prediction needs failures as well as successes, so the app logs fishing effort and not only catches. A trip with no fish is stored like any other, and each trip records the rig, lure, lure color, bait, and hours spent on every setup used. Without those zero-catch records, a model could only learn what you tend to use, not what works.
 
## How it works
 
The front end is a React single-page app built with Vite and hosted on GitHub Pages. Because Pages serves only static files, the data lives in a Supabase-hosted Postgres database that the browser reaches through Supabase's generated API. Row-level security policies restrict every user to their own rows, which is what makes it safe to ship the public anon key in the client.
 
The schema separates a trip (date, location, weather, moon phase, hours) from the setups used during it (rig, lure type, lure color, bait, hours) and from the individual catches (species, length, weight), each of which can reference the setup that produced it. Species, rigs, lure types, and baits are lookup tables seeded with common values. Each species records its scientific name and family along with an angler-style grouping such as catfish, bass, or sunfish. The full definition is in `schema.sql`, and views for the history table and charts are defined there as well.
 
Prediction is handled by a small Python pipeline in `ml/` that runs offline. A SQL view, `training_data`, flattens the log into one row per setup. The training script labels each setup 1 if it caught at least one fish of the target species and 0 otherwise, then fits an L2-regularized logistic regression with scikit-learn. Inputs are weather, location, rig, lure, lure color, bait, and log of hours fished, with hour of day, month, and moon phase encoded as sine and cosine pairs so that they wrap around correctly. One model is trained for all species combined and one for each species with enough data. The regularization strength is chosen by cross-validation with folds that are stratified and grouped by trip, so setups from the same outing never appear on both sides of a split, and the script reports log loss, Brier score, and ROC AUC against a baseline that always predicts the overall success rate.
 
The trained models are exported as JSON, not served from an API. The Predict page loads the JSON and evaluates the logistic function directly in the browser, which keeps the site fully static. Any input can be left blank, in which case the model substitutes the average effect from your own history, so you can ask about any combination of weather, location, and gear. The page also reports how each chosen factor shifts the odds relative to an average setup, ranks the best options in each category for the current inputs, and warns when the model is barely better than the baseline or when the requested trip length falls outside what has been logged. A parity check confirms that the JavaScript predictions match scikit-learn's `predict_proba`.
 
## Tech stack
 
React 18 and Vite for the interface, Supabase (Postgres, authentication, row-level security) for storage, Python with pandas and scikit-learn for training, and GitHub Actions to build and deploy to GitHub Pages.
 
## Repository layout
 
```
schema.sql                  Database tables, security policies, seed data, views
ml/training_view.sql        View that flattens the log into training rows
ml/train_model.py           Trains and exports the logistic regression models
ml/make_sample_data.py      Generates SYNTHETIC data for testing
public/models/              Exported model JSON loaded by the Predict page
src/components/             React pages (Locations, Predict)
src/lib/predict.js          In-browser model evaluation
.github/workflows/          GitHub Pages deployment
```
 
## Getting started
 
Create a Supabase project and run `schema.sql` in its SQL Editor. Copy `.env.example` to `.env.local` and fill in the project URL and anon key, then install and start the app.
 
```bash
npm install
npm run dev
```
 
To try the prediction page without any real data, generate synthetic data and train on it. This is for testing the interface only.
 
```bash
pip install -r ml/requirements.txt
python ml/make_sample_data.py --out training_data.csv
python ml/train_model.py training_data.csv
```
 
To train on real logs later, run `ml/training_view.sql` in Supabase, export `select * from training_data;` as `training_data.csv`, and rerun the training script. Delete any synthetic models from `public/models/` first. For deployment, enable GitHub Pages with the GitHub Actions source and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets. Never use the Supabase `service_role` key in this project.
 
## Current progress
 
Implemented so far are the database schema with row-level security, email authentication, a Locations page, the training pipeline, and the Predict page. Planned next are a trip-logging form with weather auto-filled from Open-Meteo, a filterable catch history table, and charts for catches by month and year, average length by species, catch rate by time of day, and a map of locations.
 
## Limitations
 
Predictions will be noisy until a meaningful number of trips has been logged, likely dozens at minimum, and the reported cross-validation metrics are slightly optimistic because the regularization strength is tuned on the same folds. The model is linear in the log-odds, so it cannot represent interactions such as a lure that only works in warm water. The data is observational and reflects when and where the angler chose to fish, so the model describes that person's own history, not fish behavior in general. The exported model files are public, since they are served with the site and contain location names and catch statistics, so avoid logging spots you would rather keep private.
 
