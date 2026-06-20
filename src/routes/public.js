'use strict';

const express = require('express');
const { getPublishedSnapshot } = require('../publish');

const router = express.Router();

// Shared locals for every public page (header/footer/popups).
function baseLocals(snapshot) {
  return {
    site: snapshot.settings || {},
    categories: snapshot.categories || [],
    popups: snapshot.popups || [],
  };
}

router.get('/', (req, res) => {
  const snap = getPublishedSnapshot();
  const banners = snap.banners || [];
  const bigBanner = banners.find((b) => b.size === 'big') || null;
  const smallBanners = banners.filter((b) => b.size === 'small').slice(0, 2);
  const latestArticles = (snap.articles || []).slice(0, 6);

  res.render('public/home', {
    ...baseLocals(snap),
    page: 'home',
    bigBanner,
    smallBanners,
    promocodes: snap.promocodes || [],
    latestArticles,
  });
});

router.get('/articles', (req, res) => {
  const snap = getPublishedSnapshot();
  const all = snap.articles || [];
  const activeCategory = req.query.category || '';
  const list = activeCategory ? all.filter((a) => a.category === activeCategory) : all;

  res.render('public/articles', {
    ...baseLocals(snap),
    page: 'articles',
    articles: list,
    activeCategory,
  });
});

router.get('/articles/:slug', (req, res) => {
  const snap = getPublishedSnapshot();
  const article = (snap.articles || []).find((a) => a.slug === req.params.slug);
  if (!article) {
    return res.status(404).render('public/404', {
      ...baseLocals(snap),
      page: 'articles',
    });
  }
  const related = (snap.articles || [])
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 3);

  res.render('public/article', {
    ...baseLocals(snap),
    page: 'articles',
    article,
    related,
  });
});

router.get('/contacts', (req, res) => {
  const snap = getPublishedSnapshot();
  res.render('public/contacts', {
    ...baseLocals(snap),
    page: 'contacts',
  });
});

module.exports = router;
