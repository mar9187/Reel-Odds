# Prediction model

Logistic regression (scikit-learn) that predicts the chance of catching at least one fish (of a chosen species, or any species) during a fishing setup, from weather, time, location, bait, lure, rig, and trip length. The trained model is exported as JSON and evaluated in the browser by `src/lib/predict.js`, so the GitHub Pages site needs no server.

## Workflow

1. In the Supabase SQL Editor, run `training_view.sql`, then `select * from training_data;` and download the results as `training_data.csv`.
2. `pip install -r ml/requirements.txt`
3. `python ml/train_model.py training_data.csv` (add `--tz` if you are not on US Central time; it is used for hour of day).
4. Commit the generated `public/models/*.json` files and redeploy. Delete any older models first; the loader rejects models from the previous linear version.

To try the pipeline before you have real data: `python ml/make_sample_data.py --out training_data.csv`. That data is synthetic; do not present its results as real.

## Design notes

- One row per setup; the label is 1 if it caught at least one fish of the species. Zero-catch setups are included on purpose, since they are what teach the model what does not work.
- Trip length enters as log(hours fished), which is how the page answers "chance in N hours".
- Hour of day, month, and moon phase are encoded as sine/cosine pairs because they wrap around.
- L2 regularisation strength (`C`) is chosen by cross-validation. Folds are stratified and grouped by trip, so setups from one outing never appear in both train and test.
- Compare `cv_log_loss` to `baseline_log_loss` (always predicting your base rate). `cv_auc` of 0.5 is guessing. Choosing `C` on the same folds that report the metrics makes them slightly optimistic.
- A blank input contributes the average effect from your own history, so any combination of inputs works.
