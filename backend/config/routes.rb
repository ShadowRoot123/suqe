Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      get "health", to: "health#show"

      post "orgs", to: "organizations#create"

      post "auth/login", to: "auth#login"
      post "auth/logout", to: "auth#logout"

      post "users/invite", to: "users#invite"
      post "users/accept_invite", to: "users#accept_invite"

      post "sync/push", to: "sync#push"
      get "sync/pull", to: "sync#pull"

      resources :products, only: %i[index show create update destroy]
      resources :categories, only: %i[index show create update destroy]
      resources :variants, only: %i[index show create update destroy]
      resources :locations, only: %i[index show create update destroy]
      resources :suppliers, only: %i[index show create update destroy]

      resources :roles, only: %i[index show create update destroy]
      resources :permissions, only: %i[index]
      resources :users, only: %i[index show update]

      resources :inventory_snapshots, only: %i[index]
      resources :inventory_movements, only: %i[index show create]

      resources :purchase_orders, only: %i[index show create update destroy] do
        resources :purchase_items, only: %i[index create update destroy]
      end
      resources :purchase_receipts, only: %i[index show create] do
        resources :purchase_receipt_items, only: %i[index]
      end

      resources :sales, only: %i[index show create] do
        resources :sale_items, only: %i[index]
        resources :payments, only: %i[index]
      end

      resources :returns, only: %i[index show create] do
        resources :return_items, only: %i[index]
        resources :refunds, only: %i[index]
      end

      resources :stock_transfers, only: %i[index show create update destroy] do
        resources :stock_transfer_items, only: %i[index create update destroy]
      end

      resources :audit_logs, only: %i[index show]
      resources :sync_outbox, only: %i[index show]
    end
  end

  match "/api/*path", to: "application#route_not_found", via: :all
end
