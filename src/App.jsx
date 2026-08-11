import { useEffect, useMemo, useState } from "react";
import { products } from "./data/products";

const questions = [
  {
    key: "occasion",
    eyebrow: "OCCASION",
    title: "어떤 상황에서 입을 옷인가요?",
    options: ["Work", "Weekend", "Date", "Travel"],
  },
  {
    key: "style",
    eyebrow: "STYLE",
    title: "어떤 스타일을 선호하나요?",
    options: ["Minimal", "Casual", "Classic", "Trendy"],
  },
  {
    key: "item",
    eyebrow: "ITEM",
    title: "지금 가장 필요한 아이템은 무엇인가요?",
    options: ["Top", "Bottom", "Outer", "Shoes"],
  },
];

const occasionCopy = {
  work: "일하는 날에도 흐트러짐 없이",
  weekend: "여유로운 주말에 부담 없이",
  date: "마음 쓰이는 약속에 자연스럽게",
  travel: "낯선 곳에서도 편안하게",
};

const styleCopy = {
  minimal: "군더더기 없이 깔끔한",
  casual: "가볍고 편안한",
  classic: "오래 두고 입기 좋은",
  trendy: "지금의 분위기를 담은",
};

const formatPrice = (price) => `${new Intl.NumberFormat("ko-KR").format(price)}원`;
const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function HeartIcon({ filled = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

function ArrowIcon({ direction = "right" }) {
  return (
    <svg className={direction === "left" ? "flip" : ""} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function App() {
  const [screen, setScreen] = useState("home");
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState("");
  const [answers, setAnswers] = useState({ occasion: "", style: "", item: "" });
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [likedProductIds, setLikedProductIds] = useState([]);

  const recommendations = useMemo(() => {
    if (!answers.item) return [];

    return products
      .filter((product) => product.category === answers.item)
      .map((product, originalIndex) => ({
        ...product,
        score:
          Number(product.occasions.includes(answers.occasion)) +
          Number(product.styles.includes(answers.style)),
        originalIndex,
      }))
      .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
      .slice(0, 4);
  }, [answers]);

  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const displayName = nickname.trim() ? `${nickname.trim()}님` : "당신";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, step, selectedProductId]);

  const toggleLike = (productId) => {
    setLikedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  };

  const startQuestions = () => {
    setNickname((current) => current.trim());
    setStep(0);
    setScreen("questions");
  };

  const continueQuestion = () => {
    if (step < questions.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    setScreen("results");
  };

  const goBackQuestion = () => {
    if (step === 0) {
      setScreen("home");
      return;
    }
    setStep((current) => current - 1);
  };

  const resetSelection = () => {
    setAnswers({ occasion: "", style: "", item: "" });
    setSelectedProductId(null);
    setStep(0);
    setScreen("questions");
  };

  if (screen === "home") {
    return (
      <main className="home-page">
        <div className="home-grid" aria-hidden="true" />
        <section className="home-content">
          <p className="wordmark">FIND MY BASIC</p>
          <div className="home-copy">
            <p className="kicker">LESS CHOICE, BETTER BASICS.</p>
            <h1>
              옷은 필요한데
              <br />뭘 골라야 할지 모르겠다면?
            </h1>
            <p className="home-description">
              세 가지 질문에 답하면
              <br />지금 필요한 기본 아이템 네 개만 골라드려요.
            </p>
          </div>
          <div className="home-actions">
            <label className="nickname-field">
              <span>NICKNAME · 선택</span>
              <input
                type="text"
                value={nickname}
                maxLength={12}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="어떻게 불러드릴까요?"
                autoComplete="off"
              />
            </label>
            <button className="primary-button" onClick={startQuestions}>
              <span>Find My Basic</span>
              <ArrowIcon />
            </button>
          </div>
        </section>
        <p className="home-index">FMB — 01</p>
      </main>
    );
  }

  if (screen === "questions") {
    const question = questions[step];
    const selectedAnswer = answers[question.key];

    return (
      <main className="question-page app-shell">
        <header className="site-header">
          <button className="text-logo" onClick={() => setScreen("home")}>FIND MY BASIC</button>
          <span>LESS, BUT BETTER.</span>
        </header>

        <section className="question-layout">
          <div className="progress-wrap" aria-label={`${step + 1} / ${questions.length}`}>
            <div className="progress-meta">
              <span>{String(step + 1).padStart(2, "0")}</span>
              <span>/ {String(questions.length).padStart(2, "0")}</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
            </div>
          </div>

          <div className="question-copy">
            <p className="eyebrow">{question.eyebrow}</p>
            <h1>{question.title}</h1>
            <p>지금 떠오르는 답 하나만 골라주세요.</p>
          </div>

          <fieldset className="option-grid">
            <legend className="sr-only">{question.title}</legend>
            {question.options.map((option, index) => {
              const value = option.toLowerCase();
              const selected = selectedAnswer === value;
              return (
                <button
                  key={option}
                  type="button"
                  className={`option-button ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => setAnswers((current) => ({ ...current, [question.key]: value }))}
                >
                  <span className="option-number">0{index + 1}</span>
                  <span>{option}</span>
                  <span className="option-marker" aria-hidden="true">{selected ? "●" : "○"}</span>
                </button>
              );
            })}
          </fieldset>

          <div className="question-nav">
            <button className="back-button" onClick={goBackQuestion}>
              <ArrowIcon direction="left" />
              Back
            </button>
            <button className="continue-button" onClick={continueQuestion} disabled={!selectedAnswer}>
              {step === questions.length - 1 ? "See My Basics" : "Continue"}
              <ArrowIcon />
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === "detail" && selectedProduct) {
    const liked = likedProductIds.includes(selectedProduct.id);
    return (
      <main className="detail-page app-shell">
        <header className="detail-header">
          <button className="back-button" onClick={() => setScreen("results")}>
            <ArrowIcon direction="left" />
            Back
          </button>
          <p className="text-logo">FIND MY BASIC</p>
          <button
            className={`icon-button detail-like ${liked ? "liked" : ""}`}
            aria-label={`${selectedProduct.name} ${liked ? "좋아요 취소" : "좋아요"}`}
            aria-pressed={liked}
            onClick={() => toggleLike(selectedProduct.id)}
          >
            <HeartIcon filled={liked} />
          </button>
        </header>

        <article className="detail-layout">
          <div className="detail-image-wrap">
            <img src={selectedProduct.image} alt={`${selectedProduct.name} 상품 이미지`} />
          </div>
          <div className="detail-info">
            <div>
              <p className="detail-brand">{selectedProduct.brand}</p>
              <p className="detail-category">{selectedProduct.category.toUpperCase()}</p>
            </div>
            <div className="detail-title">
              <h1>{selectedProduct.name}</h1>
              <p>{formatPrice(selectedProduct.price)}</p>
            </div>
            <p className="detail-description">{selectedProduct.description}</p>
            <div className="tag-list" aria-label="추천 조건">
              {[answers.occasion, answers.style, answers.item].map((tag) => (
                <span key={tag}>{titleCase(tag)}</span>
              ))}
            </div>
            <p className="detail-note">당신의 선택을 바탕으로 남긴 네 가지 중 하나예요.</p>
          </div>
        </article>
      </main>
    );
  }

  return (
    <main className="results-page app-shell">
      <header className="site-header">
        <button className="text-logo" onClick={() => setScreen("home")}>FIND MY BASIC</button>
        <span>LESS, BUT BETTER.</span>
      </header>

      <section className="results-hero">
        <div>
          <p className="eyebrow">YOUR BASIC</p>
          <h1>
            {displayName}을 위한
            <br />4가지 기본 아이템
          </h1>
        </div>
        <p className="result-description">
          {occasionCopy[answers.occasion]} 입을 수 있고,
          <br />{styleCopy[answers.style]} 아이템을 중심으로 골랐어요.
        </p>
      </section>

      <section className="selection-bar">
        <div className="selection-heading">
          <p>YOUR SELECTION</p>
          <button className="reset-button" aria-label="선택 초기화" title="선택 초기화" onClick={resetSelection}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11a8.1 8.1 0 1 0 .1 2M20 4v7h-7" />
            </svg>
          </button>
        </div>
        <div className="selection-bottom">
          <div className="tag-list dark">
            {[answers.occasion, answers.style, answers.item].map((tag) => (
              <span key={tag}>{titleCase(tag)}</span>
            ))}
          </div>
          <button className="edit-button" onClick={() => { setStep(2); setScreen("questions"); }}>
            선택 수정하기 <ArrowIcon />
          </button>
        </div>
      </section>

      <section className="recommendations-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">04 ITEMS ONLY</p>
            <h2>Recommended for you</h2>
          </div>
          <p>가장 가까운 네 개만 남겼어요.</p>
        </div>

        <div className="product-grid">
          {recommendations.map((product, index) => {
            const liked = likedProductIds.includes(product.id);
            return (
              <article className="product-card" key={product.id}>
                <div className="product-image-wrap">
                  <button
                    className="product-image-button"
                    onClick={() => { setSelectedProductId(product.id); setScreen("detail"); }}
                    aria-label={`${product.name} 상세 보기`}
                  >
                    <img src={product.image} alt={`${product.name} 상품 이미지`} />
                  </button>
                  <span className="card-index">0{index + 1}</span>
                  <button
                    className={`icon-button card-like ${liked ? "liked" : ""}`}
                    aria-label={`${product.name} ${liked ? "좋아요 취소" : "좋아요"}`}
                    aria-pressed={liked}
                    onClick={() => toggleLike(product.id)}
                  >
                    <HeartIcon filled={liked} />
                  </button>
                </div>
                <button
                  className="product-info"
                  onClick={() => { setSelectedProductId(product.id); setScreen("detail"); }}
                >
                  <span className="product-brand">{product.brand}</span>
                  <strong>{product.name}</strong>
                  <span>{formatPrice(product.price)}</span>
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="site-footer">
        <p>LESS CHOICE,<br />BETTER BASICS.</p>
        <span>FIND MY BASIC © 2026</span>
      </footer>
    </main>
  );
}

export default App;
