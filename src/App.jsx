import { useEffect, useMemo, useRef, useState } from "react";
import { products } from "./data/products";
import {
  confirmPayment,
  createPaymentOrder,
  isLivePayment,
  isPaymentConfigured,
  requestTossPayment,
} from "./lib/payments";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

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
const resolvePublicImage = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
const kakaoPostcodeScript = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
const cartStorageKey = "find-my-basic-cart-v1";
const pendingCheckoutStorageKey = "find-my-basic-pending-checkout-v1";
const pendingPaymentStorageKey = "find-my-basic-pending-payment-v1";
const baseShippingFee = 3000;
const freeShippingThreshold = 50000;
const productIds = new Set(products.map((product) => product.id));

function readStoredList(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeLineItems(items) {
  const normalized = new Map();

  if (!Array.isArray(items)) return [];

  items.forEach((item) => {
    if (!productIds.has(item?.productId)) return;

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return;

    const previousQuantity = normalized.get(item.productId)?.quantity || 0;
    normalized.set(item.productId, {
      productId: item.productId,
      quantity: Math.min(10, previousQuantity + quantity),
    });
  });

  return [...normalized.values()];
}

function createEmptyOrderForm() {
  return {
    recipientName: "",
    phone: "",
    email: "",
    postcode: "",
    address: "",
    detailAddress: "",
    deliveryRequest: "",
  };
}

function readPaymentRedirect() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("paymentResult");
  if (result !== "success" && result !== "fail") return null;

  return {
    result,
    paymentKey: (params.get("paymentKey") || "").slice(0, 200),
    orderId: (params.get("orderId") || "").slice(0, 64),
    amount: params.get("amount") || "",
    code: (params.get("code") || "PAYMENT_FAILED").slice(0, 80),
    message: (params.get("message") || "결제가 완료되지 않았습니다.").slice(0, 300),
  };
}

function readPendingPayment() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(pendingPaymentStorageKey) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function clearPaymentRedirect() {
  const cleanUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  window.history.replaceState({}, "", cleanUrl);
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

let kakaoPostcodeLoader;

function loadKakaoPostcode() {
  if (window.kakao?.Postcode) return Promise.resolve();
  if (kakaoPostcodeLoader) return kakaoPostcodeLoader;

  kakaoPostcodeLoader = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${kakaoPostcodeScript}"]`);
    const script = existingScript || document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      script.remove();
      reject(new Error("Kakao Postcode script timed out."));
    }, 10000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };

    const handleLoad = () => {
      cleanup();
      if (window.kakao?.Postcode) {
        resolve();
        return;
      }

      script.remove();
      reject(new Error("Kakao Postcode constructor is unavailable."));
    };
    const handleError = () => {
      cleanup();
      script.remove();
      reject(new Error("Kakao Postcode script failed to load."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.src = kakaoPostcodeScript;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    kakaoPostcodeLoader = undefined;
    throw error;
  });

  return kakaoPostcodeLoader;
}

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

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 7H6" />
      <circle cx="9.5" cy="20" r="1" />
      <circle cx="17.5" cy="20" r="1" />
    </svg>
  );
}

function CartShortcut({ count, onClick, dark = false }) {
  return (
    <button
      type="button"
      className={`cart-shortcut ${dark ? "cart-shortcut-dark" : ""}`}
      onClick={onClick}
      aria-label={`장바구니, 상품 ${count}개`}
    >
      <CartIcon />
      <span>{count}</span>
    </button>
  );
}

function QuantityControl({ quantity, onChange, compact = false }) {
  return (
    <div className={`quantity-control ${compact ? "compact" : ""}`} aria-label="수량 선택">
      <button type="button" onClick={() => onChange(Math.max(1, quantity - 1))} disabled={quantity <= 1} aria-label="수량 줄이기">−</button>
      <span aria-live="polite">{quantity}</span>
      <button type="button" onClick={() => onChange(Math.min(10, quantity + 1))} disabled={quantity >= 10} aria-label="수량 늘리기">+</button>
    </div>
  );
}

function OrderProductList({ items, editable = false, onQuantityChange, onRemove }) {
  return (
    <div className="order-product-list">
      {items.map(({ product, quantity }) => (
        <article className="order-product" key={product.id}>
          <img src={resolvePublicImage(product.image)} alt={`${product.name} 상품 이미지`} />
          <div className="order-product-info">
            <p>{product.brand}</p>
            <h3>{product.name}</h3>
            <span>옵션 없음 · 수량 {quantity}</span>
            {editable ? (
              <div className="order-product-actions">
                <QuantityControl compact quantity={quantity} onChange={(nextQuantity) => onQuantityChange(product.id, nextQuantity)} />
                <button type="button" onClick={() => onRemove(product.id)}>삭제</button>
              </div>
            ) : null}
          </div>
          <strong>{formatPrice(product.price * quantity)}</strong>
        </article>
      ))}
    </div>
  );
}

function PriceSummary({ subtotal, shippingFee, isMember }) {
  return (
    <div className="price-summary">
      <div><span>상품 금액</span><strong>{formatPrice(subtotal)}</strong></div>
      <div><span>배송비</span><strong>{shippingFee === 0 ? "무료" : formatPrice(shippingFee)}</strong></div>
      <div className="price-summary-total"><span>총 주문 금액</span><strong>{formatPrice(subtotal + shippingFee)}</strong></div>
      <p>
        {isMember
          ? `회원은 상품 금액 ${formatPrice(freeShippingThreshold)} 이상 무료배송`
          : `비회원 배송비 ${formatPrice(baseShippingFee)} · 회원은 ${formatPrice(freeShippingThreshold)} 이상 무료배송`}
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.877 2.684-6.614Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.91-2.258c-.805.54-1.835.86-3.046.86-2.344 0-4.328-1.585-5.037-3.714H.957v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.707V4.961H.957A9 9 0 0 0 0 9c0 1.452.347 2.827.957 4.039l3.006-2.332Z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.442 1.346l2.58-2.58C13.464.891 11.426 0 9 0A9 9 0 0 0 .957 4.961l3.006 2.332C4.672 5.164 6.656 3.58 9 3.58Z" />
    </svg>
  );
}

function AuthControl({ session, loading, error, onSignIn, onSignOut, dark = false }) {
  const user = session?.user;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email;
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className={`auth-control ${dark ? "auth-control-dark" : ""}`}>
      {user ? (
        <div className="auth-user">
          {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
          <span title={user.email}>{displayName}</span>
          <button type="button" onClick={onSignOut} disabled={loading}>로그아웃</button>
        </div>
      ) : (
        <button
          type="button"
          className="google-login-button"
          onClick={onSignIn}
          disabled={loading || !isSupabaseConfigured}
        >
          <GoogleIcon />
          <span>{loading ? "연결 중…" : "Google 로그인"}</span>
        </button>
      )}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}

function KakaoAddressFields({ value, onChange }) {
  const [isPostcodeReady, setIsPostcodeReady] = useState(Boolean(window.kakao?.Postcode));
  const [isPostcodeLoading, setIsPostcodeLoading] = useState(!window.kakao?.Postcode);
  const [isSearching, setIsSearching] = useState(false);
  const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
  const [postcodeError, setPostcodeError] = useState("");
  const detailAddressRef = useRef(null);
  const postcodeTriggerRef = useRef(null);
  const postcodeLayerRef = useRef(null);
  const postcodeCloseRef = useRef(null);
  const shouldFocusDetailRef = useRef(false);

  const preparePostcode = async () => {
    setIsPostcodeLoading(true);
    setPostcodeError("");

    try {
      await loadKakaoPostcode();
      setIsPostcodeReady(true);
      return true;
    } catch {
      setIsPostcodeReady(false);
      setPostcodeError("주소 검색 서비스를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.");
      return false;
    } finally {
      setIsPostcodeLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    loadKakaoPostcode()
      .then(() => {
        if (!active) return;
        setIsPostcodeReady(true);
        setIsPostcodeLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setIsPostcodeReady(false);
        setIsPostcodeLoading(false);
        setPostcodeError("주소 검색 서비스를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.");
      });

    return () => {
      active = false;
    };
  }, []);

  const closePostcode = (restoreFocus = true) => {
    setIsPostcodeOpen(false);
    setIsSearching(false);
    if (restoreFocus) window.requestAnimationFrame(() => postcodeTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isPostcodeOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closePostcode();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => postcodeCloseRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPostcodeOpen]);

  useEffect(() => {
    if (!shouldFocusDetailRef.current || !value.address || isPostcodeOpen) return;

    shouldFocusDetailRef.current = false;
    window.requestAnimationFrame(() => detailAddressRef.current?.focus());
  }, [isPostcodeOpen, value.address]);

  const openPostcode = async () => {
    if (!isPostcodeReady || !window.kakao?.Postcode) {
      const loaded = await preparePostcode();
      if (!loaded) return;
    }

    setIsSearching(true);
    setIsPostcodeOpen(true);
    setPostcodeError("");

    window.requestAnimationFrame(() => {
      try {
        new window.kakao.Postcode({
          oncomplete: (data) => {
            const selectedAddress = data.userSelectedType === "R"
              ? data.roadAddress || data.address
              : data.jibunAddress || data.address;
            const extraParts = [];

            if (data.userSelectedType === "R") {
              if (data.bname && /[동로가]$/.test(data.bname)) extraParts.push(data.bname);
              if (data.buildingName && data.apartment === "Y") extraParts.push(data.buildingName);
            }

            const extraAddress = extraParts.length ? ` (${extraParts.join(", ")})` : "";
            onChange({
              postcode: data.zonecode,
              address: `${selectedAddress}${extraAddress}`,
              detailAddress: "",
            });
            shouldFocusDetailRef.current = true;
            closePostcode(false);
          },
          width: "100%",
          height: "100%",
          maxSuggestItems: 5,
        }).embed(postcodeLayerRef.current);
      } catch {
        closePostcode();
        setPostcodeError("주소 검색창을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.");
      }
    });
  };

  return (
    <>
      <div className="checkout-field checkout-postcode-field">
        <label htmlFor="checkout-postcode">우편번호</label>
        <div>
          <input
            id="checkout-postcode"
            type="text"
            value={value.postcode}
            placeholder="우편번호"
            readOnly
            required
            inputMode="numeric"
          />
          <button ref={postcodeTriggerRef} type="button" onClick={openPostcode} disabled={isPostcodeLoading || isSearching}>
            {isPostcodeLoading
              ? "불러오는 중…"
              : isSearching
                ? "검색 중…"
                : postcodeError
                  ? "다시 불러오기"
                  : "주소 검색"}
          </button>
        </div>
      </div>

      <div className="checkout-field">
        <label htmlFor="checkout-address">기본주소</label>
        <input
          id="checkout-address"
          type="text"
          value={value.address}
          placeholder="주소 검색 버튼을 눌러주세요"
          readOnly
          required
          autoComplete="address-line1"
        />
      </div>

      <label>
        <span>상세주소 · 선택</span>
        <input
          ref={detailAddressRef}
          type="text"
          value={value.detailAddress}
          onChange={(event) => onChange({ detailAddress: event.target.value })}
          placeholder="동·호수 등 상세주소"
          autoComplete="address-line2"
          disabled={!value.address}
        />
      </label>

      {postcodeError ? <p className="postcode-error" role="alert">{postcodeError}</p> : null}
      <p className="address-help">카카오 주소 검색에서 주소를 선택하면 우편번호와 기본주소가 자동으로 입력됩니다.</p>

      {isPostcodeOpen ? (
        <div className="postcode-modal" role="dialog" aria-modal="true" aria-labelledby="postcode-modal-title">
          <span
            className="sr-only"
            tabIndex="0"
            onFocus={() => (postcodeLayerRef.current?.querySelector("iframe") || postcodeCloseRef.current)?.focus()}
          />
          <div className="postcode-modal-panel">
            <div className="postcode-modal-header">
              <div>
                <p className="eyebrow">KAKAO POSTCODE</p>
                <h3 id="postcode-modal-title">배송지 주소 검색</h3>
              </div>
              <button ref={postcodeCloseRef} type="button" onClick={() => closePostcode()} aria-label="주소 검색 닫기">닫기</button>
            </div>
            <div ref={postcodeLayerRef} className="postcode-embed" />
          </div>
          <span className="sr-only" tabIndex="0" onFocus={() => postcodeCloseRef.current?.focus()} />
        </div>
      ) : null}
    </>
  );
}

function App() {
  const [paymentRedirect] = useState(readPaymentRedirect);
  const [screen, setScreen] = useState(() => {
    if (paymentRedirect?.result === "success") return "paymentSuccess";
    if (paymentRedirect?.result === "fail") return "paymentFail";
    return "home";
  });
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState("");
  const [answers, setAnswers] = useState({ occasion: "", style: "", item: "" });
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [likedProductIds, setLikedProductIds] = useState([]);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState("");
  const [cartItems, setCartItems] = useState(() => normalizeLineItems(readStoredList(cartStorageKey)));
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [cartNotice, setCartNotice] = useState("");
  const [cartReturnScreen, setCartReturnScreen] = useState("results");
  const [checkoutItems, setCheckoutItems] = useState([]);
  const [checkoutSource, setCheckoutSource] = useState("cart");
  const [checkoutMode, setCheckoutMode] = useState(null);
  const [latestOrder, setLatestOrder] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("confirming");
  const [paymentError, setPaymentError] = useState("");
  const [paymentRetryNonce, setPaymentRetryNonce] = useState(0);
  const [orderConsent, setOrderConsent] = useState(false);
  const [orderFormError, setOrderFormError] = useState("");
  const [orderForm, setOrderForm] = useState(createEmptyOrderForm);
  const activeCheckoutUserIdRef = useRef(null);

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
  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const cartProducts = cartItems
    .map((item) => ({ ...item, product: products.find((product) => product.id === item.productId) }))
    .filter((item) => item.product);
  const checkoutProducts = checkoutItems
    .map((item) => ({ ...item, product: products.find((product) => product.id === item.productId) }))
    .filter((item) => item.product);
  const isMember = Boolean(session?.user);
  const isMemberCheckout = isMember && checkoutMode === "member";
  const cartSubtotal = cartProducts.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const checkoutSubtotal = checkoutProducts.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const getShippingFee = (subtotal, memberEligible = isMember) =>
    memberEligible && subtotal >= freeShippingThreshold ? 0 : baseShippingFee;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, step, selectedProductId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(cartItems));
    } catch {
      // The cart remains usable for this session when browser storage is unavailable.
    }
  }, [cartItems]);

  useEffect(() => {
    setDetailQuantity(1);
    setCartNotice("");
  }, [selectedProductId]);

  useEffect(() => {
    const nextUserId = session?.user?.id || null;
    const previousUserId = activeCheckoutUserIdRef.current;

    if (!nextUserId) {
      if (previousUserId) {
        setOrderForm(createEmptyOrderForm());
        setOrderConsent(false);
        setOrderFormError("");
      }
      activeCheckoutUserIdRef.current = null;
      if (!authLoading && checkoutMode === "member") setCheckoutMode(null);
      return;
    }

    const userChanged = previousUserId !== nextUserId;
    activeCheckoutUserIdRef.current = nextUserId;
    const userName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || "";
    setOrderForm((current) => {
      const nextForm = userChanged ? createEmptyOrderForm() : current;
      return {
        ...nextForm,
        recipientName: nextForm.recipientName || userName,
        email: nextForm.email || session.user.email || "",
      };
    });
    if (userChanged) {
      setOrderConsent(false);
      setOrderFormError("");
    }
    setCheckoutMode((current) => (current === "guest" ? current : "member"));

    try {
      const pendingCheckout = JSON.parse(window.sessionStorage.getItem(pendingCheckoutStorageKey) || "null");
      const pendingItems = normalizeLineItems(pendingCheckout?.items);
      if (pendingItems.length) {
        setCheckoutItems(pendingItems);
        setCheckoutSource(pendingCheckout.source || "cart");
        setScreen("checkout");
        window.sessionStorage.removeItem(pendingCheckoutStorageKey);
      }
    } catch {
      try {
        window.sessionStorage.removeItem(pendingCheckoutStorageKey);
      } catch {
        // Session storage can be unavailable in strict browser privacy modes.
      }
    }
  }, [authLoading, checkoutMode, session]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setAuthError("로그인 설정이 아직 연결되지 않았어요.");
      return undefined;
    }

    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError("로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthLoading(false);
      setAuthError("");
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (screen !== "paymentSuccess" || paymentRedirect?.result !== "success" || authLoading) return undefined;

    let active = true;
    const confirmRedirectedPayment = async () => {
      setPaymentStatus("confirming");
      setPaymentError("");

      const pendingPayment = readPendingPayment();
      const checkoutToken = pendingPayment?.orderId === paymentRedirect.orderId
        ? pendingPayment.checkoutToken || ""
        : "";

      try {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const result = await confirmPayment({
            paymentKey: paymentRedirect.paymentKey,
            orderId: paymentRedirect.orderId,
            amount: paymentRedirect.amount,
            checkoutToken,
          });

          if (result?.pending) {
            await wait(1200);
            continue;
          }
          if (!result?.order) throw new Error("결제 승인 결과를 확인하지 못했습니다.");
          if (!active) return;

          if (pendingPayment?.source === "cart") setCartItems([]);
          try {
            window.sessionStorage.removeItem(pendingPaymentStorageKey);
          } catch {
            // A confirmed server order is still authoritative when session storage is unavailable.
          }
          clearPaymentRedirect();
          setLatestOrder(result.order);
          setOrderConsent(false);
          setOrderForm(createEmptyOrderForm());
          setPaymentStatus("paid");
          setScreen("orderComplete");
          return;
        }

        throw new Error("결제 승인이 처리 중입니다. 잠시 후 다시 확인해주세요.");
      } catch (error) {
        if (!active) return;
        setPaymentStatus("error");
        setPaymentError(error instanceof Error ? error.message : "결제 승인을 확인하지 못했습니다.");
      }
    };

    confirmRedirectedPayment();
    return () => {
      active = false;
    };
  }, [authLoading, paymentRedirect, paymentRetryNonce, screen]);

  const signInWithGoogle = async () => {
    if (!supabase) return;

    if (screen === "checkout" && checkoutItems.length) {
      try {
        window.sessionStorage.setItem(
          pendingCheckoutStorageKey,
          JSON.stringify({ items: checkoutItems, source: checkoutSource }),
        );
      } catch {
        setAuthError("로그인 후 주문서를 이어갈 수 있도록 브라우저 세션 저장을 허용해주세요.");
        return;
      }
    }
    setAuthLoading(true);
    setAuthError("");
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setAuthLoading(false);
      setAuthError("Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    setAuthLoading(true);
    setAuthError("");
    const { error } = await supabase.auth.signOut();
    setAuthLoading(false);

    if (error) setAuthError("로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.");
  };

  const authControl = (
    <AuthControl
      session={session}
      loading={authLoading}
      error={authError}
      onSignIn={signInWithGoogle}
      onSignOut={signOut}
    />
  );

  const toggleLike = (productId) => {
    setLikedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  };

  const openCart = () => {
    setCartReturnScreen(screen === "detail" ? "detail" : screen === "results" ? "results" : "home");
    setScreen("cart");
  };

  const addToCart = (productId, quantity) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (!existing) return [...current, { productId, quantity }];
      return current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(10, item.quantity + quantity) }
          : item,
      );
    });
    setCartNotice("장바구니에 담았습니다.");
  };

  const updateCartQuantity = (productId, quantity) => {
    setCartItems((current) => current.map((item) => (item.productId === productId ? { ...item, quantity } : item)));
  };

  const removeCartItem = (productId) => {
    setCartItems((current) => current.filter((item) => item.productId !== productId));
  };

  const startCheckout = (items, source) => {
    setCheckoutItems(normalizeLineItems(items));
    setCheckoutSource(source);
    setCheckoutMode(isMember ? "member" : null);
    setOrderConsent(false);
    setOrderFormError("");
    setScreen("checkout");
  };

  const updateOrderField = (field, value) => {
    setOrderFormError("");
    setOrderForm((current) => ({ ...current, [field]: value }));
  };

  const updateOrderFields = (updates) => {
    setOrderFormError("");
    setOrderForm((current) => ({ ...current, ...updates }));
  };

  const submitOrder = async (event) => {
    event.preventDefault();
    if (checkoutProducts.length === 0 || !orderConsent || paymentSubmitting) return;

    const recipientName = orderForm.recipientName.trim();
    const phone = orderForm.phone.trim();
    const email = orderForm.email.trim();
    if (!recipientName || !phone || !email) {
      setOrderFormError("수령인, 연락처, 이메일을 모두 입력해주세요.");
      return;
    }
    if (!orderForm.postcode || !orderForm.address) {
      setOrderFormError("카카오 주소 검색으로 배송지를 선택해주세요.");
      return;
    }
    if (!isPaymentConfigured) {
      setOrderFormError("토스페이먼츠 결제 환경변수를 설정해주세요.");
      return;
    }
    setOrderFormError("");
    const customerType = isMemberCheckout ? "member" : "guest";
    const items = checkoutProducts.map(({ product, quantity }) => ({ productId: product.id, quantity }));
    setPaymentSubmitting(true);

    try {
      const order = await createPaymentOrder({
        customerType,
        items,
        recipient: {
          ...orderForm,
          recipientName,
          phone,
          email,
        },
      });

      window.sessionStorage.setItem(pendingPaymentStorageKey, JSON.stringify({
        orderId: order.orderId,
        checkoutToken: order.checkoutToken,
        items,
        source: checkoutSource,
        customerType,
      }));

      await requestTossPayment({
        order,
        customerName: recipientName,
        customerEmail: email,
        userId: isMemberCheckout ? session.user.id : null,
      });
    } catch (error) {
      try {
        window.sessionStorage.removeItem(pendingPaymentStorageKey);
      } catch {
        // Ignore storage cleanup errors and keep the actionable payment error visible.
      }
      setPaymentSubmitting(false);
      setOrderFormError(error instanceof Error ? error.message : "결제를 시작하지 못했습니다.");
    }
  };

  const retryFailedPayment = () => {
    const pendingPayment = readPendingPayment();
    const restoredItems = normalizeLineItems(pendingPayment?.items);
    clearPaymentRedirect();

    if (!restoredItems.length) {
      setScreen("home");
      return;
    }

    try {
      window.sessionStorage.removeItem(pendingPaymentStorageKey);
    } catch {
      // The checkout can still be reconstructed from the in-memory copy.
    }
    setCheckoutItems(restoredItems);
    setCheckoutSource(pendingPayment.source || "cart");
    setCheckoutMode(pendingPayment.customerType === "member" && session?.user ? "member" : "guest");
    setOrderForm(createEmptyOrderForm());
    setOrderConsent(false);
    setOrderFormError("");
    setScreen("checkout");
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
          <div className="home-header">
            <p className="wordmark">FIND MY BASIC</p>
            <div className="home-header-actions">
              <CartShortcut count={cartCount} onClick={openCart} dark />
              <AuthControl
                session={session}
                loading={authLoading}
                error={authError}
                onSignIn={signInWithGoogle}
                onSignOut={signOut}
                dark
              />
            </div>
          </div>
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
          <div className="site-header-actions">
            <span>LESS, BUT BETTER.</span>
            <CartShortcut count={cartCount} onClick={openCart} />
            {authControl}
          </div>
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

  if (screen === "cart") {
    const shippingFee = getShippingFee(cartSubtotal);
    return (
      <main className="purchase-page app-shell">
        <header className="purchase-header">
          <button className="back-button" onClick={() => setScreen(cartReturnScreen)}>
            <ArrowIcon direction="left" />
            Back
          </button>
          <button className="text-logo" onClick={() => setScreen("home")}>FIND MY BASIC</button>
          <div className="purchase-header-auth">{authControl}</div>
        </header>

        <section className="purchase-layout cart-layout">
          <div className="purchase-main">
            <div className="purchase-page-title">
              <p className="eyebrow">YOUR CART</p>
              <h1>장바구니</h1>
              <span>{cartCount} ITEMS</span>
            </div>

            {cartProducts.length ? (
              <OrderProductList
                items={cartProducts}
                editable
                onQuantityChange={updateCartQuantity}
                onRemove={removeCartItem}
              />
            ) : (
              <div className="empty-cart">
                <p>아직 담긴 상품이 없어요.</p>
                <button type="button" onClick={() => setScreen(answers.item ? "results" : "home")}>상품 보러 가기 <ArrowIcon /></button>
              </div>
            )}
          </div>

          <aside className="purchase-sidebar">
            <p className="eyebrow">ORDER SUMMARY</p>
            <PriceSummary subtotal={cartSubtotal} shippingFee={cartProducts.length ? shippingFee : 0} isMember={isMember} />
            <button
              type="button"
              className="checkout-button"
              disabled={!cartProducts.length}
              onClick={() => startCheckout(cartItems, "cart")}
            >
              주문하기 <ArrowIcon />
            </button>
            <p className="purchase-policy">비회원도 주문할 수 있습니다. 상품 금액 50,000원 이상 무료배송 혜택은 로그인 회원에게만 적용됩니다.</p>
          </aside>
        </section>
      </main>
    );
  }

  if (screen === "paymentSuccess") {
    return (
      <main className="order-complete-page app-shell">
        <header className="purchase-header">
          <span />
          <span className="text-logo">FIND MY BASIC</span>
          <span />
        </header>
        <section className="order-complete-content" aria-live="polite">
          <div className="order-complete-mark payment-status-mark" aria-hidden="true">
            {paymentStatus === "error" ? "!" : "…"}
          </div>
          <p className="eyebrow">TEST PAYMENT</p>
          <h1>{paymentStatus === "error" ? "결제 승인을 확인하지 못했습니다." : "결제 승인을 확인하고 있습니다."}</h1>
          <p>
            {paymentStatus === "error"
              ? paymentError
              : "창을 닫거나 뒤로 이동하지 마세요. 중복 요청은 같은 승인 결과로 처리됩니다."}
          </p>
          {paymentStatus === "error" ? (
            <div className="payment-error-actions">
              <button
                type="button"
                className="continue-shopping-button"
                onClick={() => setPaymentRetryNonce((value) => value + 1)}
              >
                다시 확인하기 <ArrowIcon />
              </button>
              <button type="button" className="continue-shopping-button payment-secondary-button" onClick={retryFailedPayment}>
                주문서로 돌아가기 <ArrowIcon />
              </button>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  if (screen === "paymentFail") {
    return (
      <main className="order-complete-page app-shell">
        <header className="purchase-header">
          <span />
          <button className="text-logo" onClick={() => { clearPaymentRedirect(); setScreen("home"); }}>FIND MY BASIC</button>
          <span />
        </header>
        <section className="order-complete-content">
          <div className="order-complete-mark payment-fail-mark" aria-hidden="true">!</div>
          <p className="eyebrow">PAYMENT NOT COMPLETED</p>
          <h1>결제가 완료되지 않았습니다.</h1>
          <p>{paymentRedirect?.message || "결제가 취소되었거나 인증 중 오류가 발생했습니다."}</p>
          <dl className="order-complete-meta">
            <div><dt>오류 코드</dt><dd>{paymentRedirect?.code || "PAYMENT_FAILED"}</dd></div>
            {paymentRedirect?.orderId ? <div><dt>주문번호</dt><dd>{paymentRedirect.orderId}</dd></div> : null}
          </dl>
          <button type="button" className="continue-shopping-button" onClick={retryFailedPayment} disabled={authLoading}>
            주문서에서 다시 시도하기 <ArrowIcon />
          </button>
        </section>
      </main>
    );
  }

  if (screen === "checkout") {
    const shippingFee = getShippingFee(checkoutSubtotal, isMemberCheckout);
    return (
      <main className="purchase-page app-shell">
        <header className="purchase-header">
          <button className="back-button" onClick={() => setScreen(checkoutSource === "cart" ? "cart" : "detail")}>
            <ArrowIcon direction="left" />
            Back
          </button>
          <button className="text-logo" onClick={() => setScreen("home")}>FIND MY BASIC</button>
          <div className="purchase-header-auth">{authControl}</div>
        </header>

        {!checkoutProducts.length ? (
          <section className="checkout-empty empty-cart">
            <p>주문할 상품이 없습니다.</p>
            <button type="button" onClick={() => setScreen("cart")}>장바구니로 돌아가기 <ArrowIcon /></button>
          </section>
        ) : !checkoutMode && (authLoading || isMember) ? (
          <section className="checkout-login-gate" aria-live="polite">
            <p className="eyebrow">CHECKING SESSION</p>
            <h1>주문 정보를 준비하고 있어요.</h1>
          </section>
        ) : !isMember && checkoutMode !== "guest" ? (
          <section className="checkout-login-gate">
            <p className="eyebrow">MEMBER OR GUEST</p>
            <h1>어떤 방식으로 주문할까요?</h1>
            <p>로그인 회원은 상품 금액 50,000원 이상 무료배송이며, 비회원 배송비는 3,000원입니다.</p>
            <button type="button" className="checkout-login-button" onClick={signInWithGoogle} disabled={authLoading || !isSupabaseConfigured}>
              <GoogleIcon /> 회원으로 주문하기
            </button>
            <button type="button" className="guest-checkout-button" onClick={() => setCheckoutMode("guest")}>비회원으로 주문하기</button>
          </section>
        ) : (
          <form className="purchase-layout checkout-layout" onSubmit={submitOrder}>
            <div className="purchase-main">
              <div className="purchase-page-title">
                <p className="eyebrow">CHECKOUT</p>
                <h1>주문서</h1>
                <span>{isMemberCheckout ? "MEMBER ORDER" : "GUEST ORDER"}</span>
              </div>

              <section className="checkout-section">
                <div className="checkout-section-heading">
                  <span>01</span>
                  <div><p className="eyebrow">ORDER ITEMS</p><h2>주문 상품</h2></div>
                </div>
                <OrderProductList items={checkoutProducts} />
              </section>

              <section className="checkout-section">
                <div className="checkout-section-heading">
                  <span>02</span>
                  <div><p className="eyebrow">RECIPIENT</p><h2>배송 정보</h2></div>
                </div>
                <div className="checkout-fields">
                  <label>
                    <span>수령인</span>
                    <input required value={orderForm.recipientName} onChange={(event) => updateOrderField("recipientName", event.target.value)} autoComplete="name" placeholder="이름" />
                  </label>
                  <label>
                    <span>연락처</span>
                    <input required value={orderForm.phone} onChange={(event) => updateOrderField("phone", event.target.value)} inputMode="tel" autoComplete="tel" pattern="[0-9+ -]{9,20}" title="9~20자의 숫자와 하이픈으로 입력해주세요" placeholder="010-0000-0000" />
                  </label>
                  <label>
                    <span>이메일</span>
                    <input required type="email" value={orderForm.email} onChange={(event) => updateOrderField("email", event.target.value)} autoComplete="email" placeholder="order@example.com" />
                  </label>
                  <KakaoAddressFields value={orderForm} onChange={updateOrderFields} />
                  <label>
                    <span>배송 요청사항 · 선택</span>
                    <input value={orderForm.deliveryRequest} onChange={(event) => updateOrderField("deliveryRequest", event.target.value)} placeholder="배송 시 요청사항을 입력해주세요" />
                  </label>
                </div>
                {orderFormError ? <p className="order-form-error" role="alert">{orderFormError}</p> : null}
              </section>
            </div>

            <aside className="purchase-sidebar checkout-sidebar">
              <p className="eyebrow">PAYMENT SUMMARY</p>
              <PriceSummary subtotal={checkoutSubtotal} shippingFee={shippingFee} isMember={isMemberCheckout} />
              <label className="checkout-consent">
                <input type="checkbox" checked={orderConsent} onChange={(event) => setOrderConsent(event.target.checked)} required />
                <span>결제 및 배송을 위한 개인정보 수집 및 이용에 동의합니다.</span>
              </label>
              <button
                type="submit"
                className="checkout-button"
                disabled={paymentSubmitting || !isPaymentConfigured}
              >
                {paymentSubmitting ? "결제 준비 중…" : isLivePayment ? "결제하기" : "토스 테스트 결제하기"} <ArrowIcon />
              </button>
              {!isPaymentConfigured ? (
                <p className="order-form-error" role="status">클라이언트 키와 서버 승인 API 설정이 필요합니다.</p>
              ) : null}
              <p className="purchase-policy">
                {isLivePayment
                  ? "주문 금액은 서버에서 다시 검증하며, 결제 승인 시 실제 금액이 청구됩니다."
                  : "테스트 키 전용 결제입니다. 주문 금액은 서버에서 다시 계산하며 실제 금액은 차감되지 않습니다."}
              </p>
            </aside>
          </form>
        )}
      </main>
    );
  }

  if (screen === "orderComplete" && latestOrder) {
    return (
      <main className="order-complete-page app-shell">
        <header className="purchase-header">
          <span />
          <button className="text-logo" onClick={() => setScreen("home")}>FIND MY BASIC</button>
          <span />
        </header>
        <section className="order-complete-content">
          <div className="order-complete-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">PAYMENT APPROVED</p>
          <h1>{isLivePayment ? "결제가 완료되었습니다." : "테스트 결제가 완료되었습니다."}</h1>
          <p>{isLivePayment ? "결제 승인 결과가 서버 주문에 안전하게 반영되었습니다." : "토스페이먼츠 테스트 승인 결과가 서버 주문에 안전하게 반영되었습니다."}</p>
          <dl className="order-complete-meta">
            <div><dt>주문번호</dt><dd>{latestOrder.orderNumber}</dd></div>
            <div><dt>주문 유형</dt><dd>{latestOrder.customerType === "member" ? "회원 주문" : "비회원 주문"}</dd></div>
            <div><dt>주문상태</dt><dd>{latestOrder.status}</dd></div>
            <div><dt>총 주문 금액</dt><dd>{formatPrice(latestOrder.total)}</dd></div>
            {latestOrder.paymentMethod ? <div><dt>결제수단</dt><dd>{latestOrder.paymentMethod}</dd></div> : null}
          </dl>
          <button type="button" className="continue-shopping-button" onClick={() => setScreen(answers.item ? "results" : "home")}>
            계속 쇼핑하기 <ArrowIcon />
          </button>
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
          <div className="detail-header-actions">
            <CartShortcut count={cartCount} onClick={openCart} />
            <button
              className={`icon-button detail-like ${liked ? "liked" : ""}`}
              aria-label={`${selectedProduct.name} ${liked ? "좋아요 취소" : "좋아요"}`}
              aria-pressed={liked}
              onClick={() => toggleLike(selectedProduct.id)}
            >
              <HeartIcon filled={liked} />
            </button>
          </div>
        </header>

        <article className="detail-layout">
          <div className="detail-image-wrap">
            <img src={resolvePublicImage(selectedProduct.image)} alt={`${selectedProduct.name} 상품 이미지`} />
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
            <section className="purchase-panel" aria-label="구매 옵션">
              <div className="purchase-quantity">
                <div>
                  <span>QUANTITY</span>
                  <p>옵션 없음</p>
                </div>
                <QuantityControl quantity={detailQuantity} onChange={setDetailQuantity} />
              </div>
              <div className="purchase-total">
                <span>상품 금액</span>
                <strong>{formatPrice(selectedProduct.price * detailQuantity)}</strong>
              </div>
              <div className="purchase-actions">
                <button type="button" className="cart-add-button" onClick={() => addToCart(selectedProduct.id, detailQuantity)}>장바구니 담기</button>
                <button
                  type="button"
                  className="buy-now-button"
                  onClick={() => startCheckout([{ productId: selectedProduct.id, quantity: detailQuantity }], "direct")}
                >
                  바로 주문하기 <ArrowIcon />
                </button>
              </div>
              {cartNotice ? <p className="cart-notice" role="status">{cartNotice}</p> : null}
            </section>
          </div>
        </article>
      </main>
    );
  }

  return (
    <main className="results-page app-shell">
      <header className="site-header">
        <button className="text-logo" onClick={() => setScreen("home")}>FIND MY BASIC</button>
        <div className="site-header-actions">
          <span>LESS, BUT BETTER.</span>
          <CartShortcut count={cartCount} onClick={openCart} />
          {authControl}
        </div>
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
                    <img src={resolvePublicImage(product.image)} alt={`${product.name} 상품 이미지`} />
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
