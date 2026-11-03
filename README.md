# Suivi de Portefeuille & Ordres d'Équilibrage (PEA / Titres)

Application web moderne développée avec **React 19**, **Vite** et **Tailwind CSS**. Elle permet de suivre ses positions, valorisations, plus-values, dividendes, et de calculer automatiquement les ordres d'ajustement pour rééquilibrer le prix moyen unitaire (PRU / Prix d'équilibre) par rapport au cours de marché.

---

## 🚀 1. Lancer le projet sur votre machine (En local)

### Prérequis
- Avoir installé **Node.js** (version 18 ou supérieure recommandée) : [nodejs.org](https://nodejs.org)
- Avoir installé **Git** : [git-scm.com](https://git-scm.com)

### Étapes
1. **Ouvrez un terminal** dans le dossier du projet :
   ```bash
   cd chemin/vers/le/dossier/du/projet
   ```

2. **Installez les dépendances** :
   ```bash
   npm install
   ```

3. **Démarrez le serveur local de développement** :
   ```bash
   npm run dev
   ```

4. **Accédez à l'application** :
   Ouvrez votre navigateur sur l'adresse affichée dans le terminal (par défaut `http://localhost:3000` ou `http://localhost:5173`).

---

## 📦 2. Mettre le projet sur GitHub

Si vous avez téléchargé le code et souhaitez créer un nouveau dépôt sur votre compte GitHub :

1. Rendez-vous sur [GitHub.com](https://github.com) et cliquez sur **New repository** (Nouveau dépôt).
2. Donnez un nom à votre dépôt (ex: `gestion-portefeuille-pea`) et choisissez **Public** ou **Private**. Ne cochez pas "Add a README" si vous utilisez déjà ce projet.
3. Dans votre terminal, à la racine du projet, exécutez les commandes suivantes :

```bash
# 1. Initialiser le dépôt Git local
git init

# 2. Ajouter tous les fichiers (node_modules est déjà ignoré grâce au .gitignore)
git add .

# 3. Créer le premier commit
git commit -m "Initial commit - Suivi de portefeuille"

# 4. Renommer la branche principale en 'main'
git branch -M main

# 5. Lier votre dossier local à votre dépôt GitHub (remplacez par votre URL)
git remote add origin https://github.com/VOTRE_NOM_UTILISATEUR/VOTRE_DEPOT.git

# 6. Envoyer le code vers GitHub
git push -u origin main
```

---

## 🌐 3. Déployer l'application gratuitement en ligne

Comme il s'agit d'une application web autonome (React SPA avec stockage sécurisé dans le navigateur via LocalStorage), elle peut être hébergée **gratuitement** en ligne de deux façons simples :

### Option A : Déploiement automatique avec GitHub Pages (Déjà configuré !)
Le workflow GitHub Actions est déjà préparé dans `.github/workflows/deploy.yml` et `vite.config.ts` est configuré avec un chemin relatif (`base: './'`).

1. Une fois votre projet poussé sur GitHub, allez sur votre dépôt GitHub.
2. Cliquez sur l'onglet **Settings** (Paramètres) > menu **Pages** à gauche.
3. Sous **Build and deployment** > **Source**, sélectionnez **GitHub Actions**.
4. C'est tout ! À chaque `git push`, GitHub construira et déploiera votre application sur `https://<votre-pseudo>.github.io/<nom-du-depot>/`.

### Option B : Déploiement en 1 clic avec Vercel ou Netlify
1. Connectez-vous sur [vercel.com](https://vercel.com) ou [netlify.com](https://netlify.com) avec votre compte GitHub.
2. Cliquez sur **Import Project** et choisissez votre dépôt GitHub.
3. Les réglages sont détectés automatiquement (`npm run build` et dossier de sortie `dist`).
4. Cliquez sur **Deploy**. Votre application est en ligne en quelques secondes avec une URL sécurisée HTTPS.

---

## 🛠️ Commandes disponibles

| Commande | Action |
| :--- | :--- |
| `npm run dev` | Lance le serveur local de test |
| `npm run build` | Compile l'application pour la production dans le dossier `dist/` |
| `npm run preview` | Prévisualise en local la version de production compilée |
| `npm run lint` | Vérifie la syntaxe TypeScript |

---

## 💾 Sauvegarde et Données
L'application stocke vos données localement dans votre navigateur (`LocalStorage`). Vous pouvez également utiliser à tout moment les boutons d'export :
- **Exporter en JSON** (sauvegarde complète et restauration facile)
- **Exporter en Excel (.xlsx)** (analyse sous Microsoft Excel, LibreOffice ou Google Sheets).
