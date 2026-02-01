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
    end
  end

  match "/api/*path", to: "application#route_not_found", via: :all
end
