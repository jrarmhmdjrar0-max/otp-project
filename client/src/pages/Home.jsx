import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { productAPI, advertisementAPI } from '../utils/api';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import ProductCard from '../components/ProductCard';
import translations from '../i18n/translations.json';

const Home = () => {
  const { isDark } = useTheme();
  const { language } = useLanguage();
  const t = translations[language];
  
  const [featured, setFeatured] = useState([]);
  const [ads, setAds] = useState([]);
  const [adIndex, setAdIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [featuredRes, adsRes] = await Promise.all([
          productAPI.getAll({ featured: true }),
          advertisementAPI.getAll()
        ]);
        setFeatured(featuredRes.data.products);
        setAds(adsRes.data.ads);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const nextAd = () => {
    setAdIndex((prev) => (prev + 1) % ads.length);
  };

  const prevAd = () => {
    setAdIndex((prev) => (prev - 1 + ads.length) % ads.length);
  };

  const handleAddToCart = (product, color) => {
    console.log('Add to cart:', product, color);
    // TODO: Add to cart logic
  };

  return (
    <div className={isDark ? 'bg-gray-950 text-white' : 'bg-white text-black'}>
      {/* Hero Section */}
      <section className={`${isDark ? 'bg-gray-900' : 'bg-gradient-to-r from-orange-400 to-orange-600'} text-white py-20 text-center`}>
        <h1 className="text-5xl font-bold mb-4">🎸 {t.home.title}</h1>
        <p className="text-xl mb-8">{t.home.subtitle}</p>
        <button className="bg-white text-orange-600 font-bold py-3 px-8 rounded-lg hover:bg-gray-100 transition">
          {t.products.title}
        </button>
      </section>

      {/* Advertisement Carousel */}
      {ads.length > 0 && (
        <section className="container mx-auto px-4 py-8">
          <div className="relative">
            <img
              src={ads[adIndex]?.image}
              alt={ads[adIndex]?.title}
              className="w-full h-64 object-cover rounded-lg"
            />
            {ads.length > 1 && (
              <>
                <button
                  onClick={prevAd}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-50 p-2 rounded-full hover:bg-opacity-75"
                >
                  <FaChevronLeft />
                </button>
                <button
                  onClick={nextAd}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-50 p-2 rounded-full hover:bg-opacity-75"
                >
                  <FaChevronRight />
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="container mx-auto px-4 py-16">
        <h2 className={`text-3xl font-bold mb-8 text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
          ⭐ {t.home.featured}
        </h2>

        {loading ? (
          <div className="text-center py-8">
            <p>{t.common.loading}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}
      </section>

      {/* Features Section */}
      <section className={`${isDark ? 'bg-gray-800' : 'bg-gray-100'} py-16`}>
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">🚚</div>
              <h3 className="text-xl font-bold mb-2">شحن سريع</h3>
              <p>توصيل في جميع أنحاء البلاد</p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">💳</div>
              <h3 className="text-xl font-bold mb-2">دفع آمن</h3>
              <p>جميع طرق الدفع متاحة</p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🎧</div>
              <h3 className="text-xl font-bold mb-2">دعم فني</h3>
              <p>خدمة عملاء متخصصة</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
