export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
] as const;

export const FACTORY_ABI = [
  'function feeManager() view returns (address)',
  'function getPair(address tokenA, address tokenB) view returns (address)',
  'function allPairs(uint256) view returns (address)',
  'function allPairsLength() view returns (uint256)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function createPair(address tokenA, address tokenB) returns (address pair)',
  'function pause()',
  'function unpause()',
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount)',
] as const;

export const POOL_ABI = [
  'function factory() view returns (address)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function cumulativeProtocolFee0() view returns (uint256)',
  'function cumulativeProtocolFee1() view returns (uint256)',
  'event Mint(address indexed sender, uint256 amount0, uint256 amount1)',
  'event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)',
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
] as const;

export const ROUTER_ABI = [
  'function factory() view returns (address)',
  'function WETH() view returns (address)',
  'function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) pure returns (uint256 amountB)',
  'function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) view returns (uint256 amountOut)',
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
  'function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
] as const;

export const LISTING_FEE_ABI = [
  'function feeReceiverWallet() view returns (address)',
  'function paymentToken() view returns (address)',
  'function listingFee() view returns (uint256)',
  'function factory() view returns (address)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function totalListedTokens() view returns (uint256)',
  'function listings(address) view returns (address tokenAddress, address lister, string name, string symbol, uint8 decimals, address pairToken, address pairAddress, uint256 feePaid, address paymentToken, uint256 listedAt, bool exists)',
  'function listToken(address tokenAddress, address pairWithToken) returns (address pairAddress)',
  'function setListingFee(uint256 newFee)',
  'function setPaymentToken(address newPaymentToken)',
  'function setFeeReceiverWallet(address newFeeReceiver)',
  'function pause()',
  'function unpause()',
  'event ListingFeeCollected(address indexed lister, address indexed tokenAddress, address indexed paymentToken, uint256 feeAmount, address feeReceiverWallet, uint256 timestamp)',
  'event TokenListed(address indexed tokenAddress, address indexed lister, string name, string symbol, uint8 decimals, address pairAddress, uint256 timestamp)',
] as const;

export const FEE_MANAGER_ABI = [
  'function protocolFeeReceiver() view returns (address)',
  'function swapFeeBps() view returns (uint256)',
  'function protocolFeeBps() view returns (uint256)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function setProtocolFeeReceiver(address newReceiver)',
  'function setSwapFees(uint256 newSwapFeeBps, uint256 newProtocolFeeBps)',
  'function pause()',
  'function unpause()',
] as const;
